// Phase 1 (RNFirebase foundation) — dynamic app config.
//
// WHY THIS FILE EXISTS
// `app.json` is static JSON, and JSON cannot read `process.env`. React Native
// Firebase needs `android.googleServicesFile` / `ios.googleServicesFile` to point
// at the Firebase native configuration files, which are NOT committed (owner
// decision P-1: EAS build-time injection). EAS supplies each file as a *file*
// environment variable whose value is the path the build runner wrote the uploaded
// file to — "a location outside of the project directory" (Expo docs,
// "Environment variables in EAS" → FAQ → "Can I use file environment variables in
// my EAS project?"). That path can only be read at config-resolution time, which
// is what a dynamic config is for. It is NOT the literal string
// "./google-services.json", and assuming it were would point the build at a file
// the runner never created.
//
// THE FALLBACK IS THE DOCUMENTED ONE, AND IT IS THE LOCAL PATH
// With no EAS variable set — a local `expo run:android`, a prebuild on a developer
// machine — the conventional project-root file name is used instead, exactly as
// Expo's own example shows. Both files are git-ignored in `mobile/.gitignore` and
// `mobile/.easignore`, so nothing here can commit or upload them.
//
// BOTH FIELDS ALWAYS RESOLVE, AND THE iOS ONE IS NOT OPTIONAL
// `@react-native-firebase/auth`'s config plugin throws
// "Your app.json file is missing ios.googleServicesFile" when the iOS field is
// absent, and READS that file during config resolution — so leaving either field
// out is not a neutral "not configured yet" state, it is a hard failure of
// `expo prebuild`/config introspection. What is deferred is the file itself, not
// the field.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
// It never reads, prints or embeds the CONTENTS of either file. Only a path passes
// through, so no Firebase project identifier, key or secret can reach the app
// config, the bundle, or a log line from here.
//
// MAINTENANCE
// The two variable names below are the contract with `eas env:set --type file`
// (see docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md and
// the Phase 1 record in docs/freebuff/). Renaming one means recreating the EAS
// variable under the new name: the build would keep passing, fall back to a local
// path that does not exist on the runner, and fail from inside Gradle instead of
// here.

module.exports = ({ config }) => {
  const base = config ?? {};

  return {
    ...base,
    android: {
      ...base.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
    },
    ios: {
      ...base.ios,
      googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST || './GoogleService-Info.plist',
    },
  };
};
