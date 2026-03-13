import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createOrderFileController } from '../../../src/ui/order-file-controller.js';

beforeEach(() => {
  document.body.innerHTML = '<input type="file" id="orderFileInput" />';
});

describe('collection file controller', () => {
  test('shows fallback status when collection cannot be loaded yet', () => {
    const showStatus = vi.fn();
    const controller = createOrderFileController({
      orderFileInput: document.getElementById('orderFileInput'),
      canLoadCollection: () => false,
      onCollectionLines: vi.fn(),
      showStatus,
      collectionFirstUnavailableText: () => 'Load the folder first, then load the collection file.',
      collectionReadErrorText: (err) => String(err),
    });

    controller.onLoadOrderClick();
    expect(showStatus).toHaveBeenCalledWith('Load the folder first, then load the collection file.', 4000);
  });

  test('passes parsed lines to the collection callback', async () => {
    const onCollectionLines = vi.fn();
    const controller = createOrderFileController({
      orderFileInput: document.getElementById('orderFileInput'),
      canLoadCollection: () => true,
      onCollectionLines,
      showStatus: vi.fn(),
      collectionFirstUnavailableText: () => '',
      collectionReadErrorText: (err) => String(err),
    });

    const input = document.getElementById('orderFileInput');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [
        {
          text: () => Promise.resolve('one.mp4\r\ntwo.webm\n'),
        },
      ],
    });

    controller.onOrderFileChange({ target: input });
    await Promise.resolve();
    await Promise.resolve();
    expect(onCollectionLines).toHaveBeenCalledWith(['one.mp4', 'two.webm', ''], expect.anything());
    expect(input.value).toBe('');
  });
});

