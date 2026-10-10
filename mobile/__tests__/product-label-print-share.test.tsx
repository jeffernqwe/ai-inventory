/**
 * The product barcode label — print and share.
 *
 * WHY THIS SUITE EXISTS. The two label actions must produce **one** document. The PDF path
 * (`printToFileAsync` → `Sharing.shareAsync`) always passed the page geometry
 * `barcodeLabelHtml` returns; the print path passed `html` alone, which lets `expo-print`
 * page the label at its default US Letter (612×792) — a different document from the 595×340
 * label the share sheet offers. Both now hand the same `{ html, width, height }` to their
 * respective entry point, and the first case below fails if either one drifts again.
 *
 * It also pins the two ways this flow can fail without lying to the user: sharing being
 * unavailable, and a PDF that could not be produced. Neither may open a share sheet, and
 * neither may leave the buttons stuck.
 *
 * WHAT IT DOES NOT PROVE — and does not claim: that a printer or the OS share sheet renders
 * the file, and that a printed barcode scans. Those need a device, and they are recorded as
 * device-pass acceptance items (roadmap §27AH, ISS-13) rather than asserted here. The one
 * device-independent property that *is* asserted is the document itself: it is self-contained
 * (no network, no local file reference, no `<img>`, because iOS print cannot load local
 * assets) and it carries the product's identity.
 *
 * Only the module boundaries are mocked — `expo-print`, `expo-sharing`, `lib/auth` and
 * `lib/api`. The screen, the label HTML and the EAN-13 module math are the real ones.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { inventoryApi, productsApi } from '../lib/api';
import { useSession } from '../lib/auth';
import { ean13CheckDigit } from '../lib/ean13';
import { ROLES } from '../lib/permissions';
import { ThemeProvider } from '../lib/theme-context';

import ProductScreen from '../app/(app)/products/[id]';

// ---------------------------------------------------------------------------
// The mock seam
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'p1' }),
  // The real hook subscribes to navigation focus; the label flow never depends on it, and
  // stubbing it keeps the request counts in this suite to the mount only.
  useFocusEffect: () => undefined,
}));

const mockPrintAsync = jest.fn();
const mockPrintToFileAsync = jest.fn();

jest.mock('expo-print', () => ({
  printAsync: (...args: unknown[]) => mockPrintAsync(...args),
  printToFileAsync: (...args: unknown[]) => mockPrintToFileAsync(...args),
}));

const mockIsAvailable = jest.fn();
const mockShareAsync = jest.fn();

jest.mock('expo-sharing', () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailable(...args),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
  isSessionError: () => false,
}));

jest.mock('../lib/api', () => ({
  productsApi: {
    get: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
    generateBarcode: jest.fn(),
  },
  inventoryApi: { list: jest.fn() },
}));

const mockedUseSession = useSession as jest.Mock;
const productsGet = productsApi.get as jest.Mock;
const inventoryList = inventoryApi.list as jest.Mock;

/** A real internal EAN-13: the restricted-distribution prefix 2 and a computed check digit. */
const CODE = `200000000001${ean13CheckDigit('200000000001')}`;

const PRODUCT = {
  id: 'p1',
  name: 'Widget',
  sku: 'SKU-1',
  unit: 'pc',
  status: 'ACTIVE',
  barcode: CODE,
  costPrice: 1.5,
  sellingPrice: 2.5,
  minimumStock: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const alertSpy = jest.spyOn(Alert, 'alert');

/**
 * `render` is awaited, as this project's other screen suites do it: the React 19 / RNTL 14 pair
 * resolves its queries asynchronously, so a bare call would hand back a promise. The screen is
 * rendered directly rather than through `renderRouter` — this suite is about two buttons and the
 * document they hand to expo-print, not about navigation.
 */
const mount = async () => {
  const view = await render(
    <ThemeProvider>
      <ProductScreen />
    </ThemeProvider>
  );
  // Wait for the product itself, not for a label button: one case below asserts that the
  // buttons are ABSENT for a non-EAN-13 barcode, so the helper cannot require them.
  await waitFor(() => expect(view.getByText('Widget')).toBeTruthy());
  return view;
};

/** The one argument `printAsync` (or `printToFileAsync`) was called with. */
const printedPage = (mock: jest.Mock): { html: string; width: number; height: number } =>
  mock.mock.calls[0][0] as { html: string; width: number; height: number };

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy.mockImplementation(() => undefined);
  mockedUseSession.mockReturnValue({
    user: { id: 'u1', name: 'Test User', role: ROLES.MANAGER },
    token: 'token-1',
    signOut: jest.fn(),
  });
  productsGet.mockResolvedValue(PRODUCT);
  inventoryList.mockResolvedValue({ items: [], total: 0 });
  mockIsAvailable.mockResolvedValue(true);
  mockPrintAsync.mockResolvedValue(undefined);
  mockPrintToFileAsync.mockResolvedValue({ uri: 'file:///label.pdf', base64: null });
  mockShareAsync.mockResolvedValue(undefined);
});

describe('the label document is one document', () => {
  it('prints the label on its own page, with the geometry the PDF path uses', async () => {
    const view = await mount();

    fireEvent.press(view.getByText('Print label'));
    await waitFor(() => expect(mockPrintAsync).toHaveBeenCalledTimes(1));

    const printed = printedPage(mockPrintAsync);

    // The regression this pins: `printAsync({ html })` alone would leave both numbers
    // undefined and page the label at expo-print's US Letter default.
    expect(typeof printed.html).toBe('string');
    expect(printed.width).toBeGreaterThan(0);
    expect(printed.height).toBeGreaterThan(0);

    fireEvent.press(view.getByText('Share PDF'));
    await waitFor(() => expect(mockPrintToFileAsync).toHaveBeenCalledTimes(1));

    // Exactly equal, not merely both present: one layout, two destinations.
    expect(printedPage(mockPrintToFileAsync)).toEqual({
      html: printed.html,
      width: printed.width,
      height: printed.height,
    });
  });

  it('is a small label page, not a sheet of paper', async () => {
    const view = await mount();

    fireEvent.press(view.getByText('Print label'));
    await waitFor(() => expect(mockPrintAsync).toHaveBeenCalledTimes(1));

    const { width, height } = printedPage(mockPrintAsync);

    // US Letter would be 612×792; the label page is deliberately smaller than both.
    expect(width).toBeLessThan(612);
    expect(height).toBeLessThan(792);
  });

  it('offers the produced file as a PDF, carrying the product and its code', async () => {
    const view = await mount();

    fireEvent.press(view.getByText('Share PDF'));
    await waitFor(() => expect(mockShareAsync).toHaveBeenCalledTimes(1));

    expect(mockShareAsync).toHaveBeenCalledWith('file:///label.pdf', {
      mimeType: 'application/pdf',
      dialogTitle: 'Save or share the barcode label',
      UTI: 'com.adobe.pdf',
    });

    const { html } = printedPage(mockPrintToFileAsync);
    expect(html).toContain('<svg');
    expect(html).toContain(CODE);
    expect(html).toContain('Widget');
    expect(html).toContain('SKU-1');
  });

  it('is self-contained, because iOS print cannot load local or remote assets', async () => {
    const view = await mount();

    fireEvent.press(view.getByText('Print label'));
    await waitFor(() => expect(mockPrintAsync).toHaveBeenCalledTimes(1));

    const { html } = printedPage(mockPrintAsync);

    // The only URL in the document may be the SVG namespace declaration, which is an
    // identifier rather than a fetch. Anything else — an image, a stylesheet, a font, a local
    // file — would be a reference the iOS print renderer cannot be trusted to resolve.
    const urls = html.match(/https?:\/\/[^"'\s>]*/g) ?? [];
    expect(urls).toEqual(['http://www.w3.org/2000/svg']);
    expect(html).not.toContain('file://');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('url(');
    expect(html).not.toContain('src=');
  });

  it('offers no label actions for a barcode that is not an EAN-13', async () => {
    productsGet.mockResolvedValue({ ...PRODUCT, barcode: 'ABC-123' });

    const view = await mount();

    expect(view.queryByText('Print label')).toBeNull();
    expect(view.queryByText('Share PDF')).toBeNull();
  });
});

describe('the label flow fails without misleading the user', () => {
  it('opens no file and says so when the device cannot share', async () => {
    mockIsAvailable.mockResolvedValue(false);
    const view = await mount();

    fireEvent.press(view.getByText('Share PDF'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Sharing is not available on this device.')
    );

    // Nothing was rendered to disk and no sheet was opened.
    expect(mockPrintToFileAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('refuses to share when no PDF file was produced', async () => {
    mockPrintToFileAsync.mockResolvedValue({ uri: '', base64: null });
    const view = await mount();

    fireEvent.press(view.getByText('Share PDF'));
    await waitFor(() => expect(alertSpy.mock.calls.length).toBeGreaterThan(0));

    expect(alertSpy.mock.calls[0][0]).toBe('Could not save or share the label');
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('reports a print failure and leaves the actions usable', async () => {
    mockPrintAsync.mockRejectedValueOnce(new Error('no printer service'));
    const view = await mount();

    fireEvent.press(view.getByText('Print label'));
    await waitFor(() => expect(alertSpy.mock.calls.length).toBeGreaterThan(0));
    expect(alertSpy.mock.calls[0][0]).toBe('Could not print the label');

    // The busy flag cleared, so the user can try again rather than face a dead button.
    fireEvent.press(view.getByText('Print label'));
    await waitFor(() => expect(mockPrintAsync).toHaveBeenCalledTimes(2));
  });
});
