"""Inspect a production AAB without Java, bundletool or the Android SDK.

Reads the bundle as a ZIP and reports the facts a release check needs: structure, manifest
identity (protobuf, so values are read from the field adjacent to each attribute name),
declared permissions, update metadata, the JS bundle's build and API target, and the embedded
Expo config. Standard library only.

    python docs/evidence/device-runs/2026-10-24-release-aab/verify.py path/to/app-release.aab

The recorded output of the 2026-10-24 run this reproduces is beside it in aab-verification.txt.
"""
import hashlib
import json
import re
import sys
import zipfile

path = sys.argv[1]
with open(path, "rb") as fh:
    digest = hashlib.sha256(fh.read()).hexdigest()
z = zipfile.ZipFile(path)
names = z.namelist()
manifest = z.read("base/manifest/AndroidManifest.xml")


def attr(name: bytes) -> str:
    """An AAB manifest stores each attribute as name -> value; the value follows the name."""
    i = manifest.find(name + b"\x1a")
    if i < 0:
        return "NOT FOUND"
    start = i + len(name) + 2  # skip \x1a and the one-byte length
    length = manifest[i + len(name) + 1]
    return manifest[start:start + length].decode("utf-8", "replace")


def section(title: str) -> None:
    print(f"\n== {title} ==")


print(f"file: {path}")
print(f"bytes: {__import__('os').path.getsize(path)}")
print(f"sha256: {digest}")

section("structure")
print(f"entries: {len(names)}")
print(f"manifest: {'base/manifest/AndroidManifest.xml' in names}")
print(f"resources.pb: {'base/resources.pb' in names} {z.getinfo('base/resources.pb').file_size} bytes"
      if "base/resources.pb" in names else "resources.pb: MISSING")
print("dex:", [(n, z.getinfo(n).file_size) for n in names if re.match(r"^base/dex/classes\d*\.dex$", n)])
print("ABIs:", sorted({n.split("/")[2] for n in names if n.startswith("base/lib/")}))
symbols = [n for n in names if n.startswith("BUNDLE-METADATA/") and "debugsymbols" in n]
print(f"debug symbols: {len(symbols)} files")
print("signature entries:", [n for n in names if n.startswith("META-INF/") and n.count("/") == 1])
for banned in ("expo-dev-menu", "expo-dev-launcher", "react-native-web", ".env"):
    hits = [n for n in names if banned in n]
    print(f"  {banned}: {len(hits)}")

section("manifest (protobuf; values read from the adjacent field)")
print(f"package: {attr(b'package')}")
print(f"versionName: {attr(b'versionName')}")
print(f"versionCode: {attr(b'versionCode')}")
print(f"minSdkVersion: {attr(b'minSdkVersion')}")
print(f"targetSdkVersion: {attr(b'targetSdkVersion')}")

def element_attr(block: bytes, attr: bytes = b"\x12\x04name") -> str | None:
    """Read the value of the first `attr` in a protobuf block (length-prefixed string)."""
    i = block.find(attr)
    if i < 0 or block[i + len(attr):i + len(attr) + 1] != b"\x1a":
        return None
    start = i + len(attr) + 2
    return block[start:start + block[i + len(attr) + 1]].decode("utf-8", "replace")


# Each `uses-permission` element is one block: the element name, then its attributes. A capped
# permission carries maxSdkVersion in the same block. A `name` inside a block is that element's
# own attribute, so this reads the declaration rather than any string that merely looks like one
# (`android:permission` on a service is a REQUIREMENT on callers, not a request).
print("declared permissions:")
declared = []
for block in manifest.split(b"\x1a\x0fuses-permission")[1:]:
    name = element_attr(block)
    if not name:
        continue
    cap = re.search(rb"maxSdkVersion\x1a\x02(\d+)", block)
    declared.append((name, cap.group(1).decode() if cap else None))
print(f"  count: {len(declared)}")
for perm, cap in declared:
    print(f"   {perm}" + (f"  (maxSdkVersion {cap})" if cap else ""))

print("permissions the app DEFINES (granted only to itself, not requested):")
for block in manifest.split(b"\x1a\npermission")[1:]:
    name = element_attr(block)
    print(f"   {name}") if name else None

print("android:permission requirements on components (not requests):")
for i in [m.start() for m in re.finditer(rb"\x12\npermission\x1a", manifest)]:
    start = i + len(b"\x12\npermission\x1a") + 1
    ln = manifest[i + len(b"\x12\npermission\x1a")]
    print("   " + manifest[start:start + ln].decode("utf-8", "replace"))

print("update meta-data:")
url = re.search(rb"https://u\.expo\.dev/[0-9a-f-]+", manifest)
print(f"  EXPO_UPDATE_URL: {url.group(0).decode() if url else 'NOT FOUND'}")
channel = re.search(rb"\{\"expo-channel-name\":\"([a-z]+)\"\}", manifest)
print(f"  request headers: {{'expo-channel-name':'{channel.group(1).decode()}'}}" if channel else "  request headers: NOT FOUND")
# The manifest points at @string/expo_runtime_version; the value lives in resources.pb.
resources = z.read("base/resources.pb")
i = resources.find(b"expo_runtime_version")
runtime = re.search(rb"([0-9]+\.[0-9]+\.[0-9]+)", resources[i:i + 400]) if i >= 0 else None
print(f"  expo_runtime_version string: {runtime.group(1).decode() if runtime else 'NOT FOUND'}")

section("JS bundle")
bundle_name = next((n for n in names if n.endswith("index.android.bundle")), None)
if bundle_name is None:
    print("no index.android.bundle")
else:
    data = z.read(bundle_name)
    print(f"entry: {bundle_name} bytes: {len(data)}")
    print(f"hermes magic: {data[:8].hex()}")
    for needle in (b"ai-inventory-l1mi.onrender.com", b"localhost:4000", b"inventoryai.auth.userSnapshot"):
        print(f"{needle.decode()}: {data.count(needle)}")

section("app.config inside the bundle")
config = json.loads(z.read("base/assets/app.config"))
print(f"version: {config.get('version')} | runtimeVersion: {config.get('runtimeVersion')}")
print(f"android package: {config.get('android', {}).get('package')} | scheme: {config.get('scheme')}")
print(f"updates: {config.get('updates')}")
