import { describe, expect, test, vi } from 'vitest';
import { ApplicationEventController } from '../../src/app/application-event-controller.js';

describe('ApplicationEventController', () => {
  test('routes global browser events and releases them on page hide', () => {
    const onFullscreenChange = vi.fn();
    const onResize = vi.fn();
    const onKeyDown = vi.fn();
    const onGlobalKeyDown = vi.fn();
    const onKeyUp = vi.fn();
    const onWindowBlur = vi.fn();
    const onPageHide = vi.fn();
    new ApplicationEventController({
      document,
      window,
      onFullscreenChange,
      onResize,
      onKeyDown,
      onGlobalKeyDown,
      onKeyUp,
      onWindowBlur,
      onPageHide,
    });

    document.dispatchEvent(new Event('fullscreenchange'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    window.dispatchEvent(new Event('blur'));

    expect(onFullscreenChange).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onGlobalKeyDown).toHaveBeenCalledOnce();
    expect(onKeyUp).toHaveBeenCalledOnce();
    expect(onWindowBlur).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('fullscreenchange'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    window.dispatchEvent(new Event('blur'));

    expect(onPageHide).toHaveBeenCalledOnce();
    expect(onFullscreenChange).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onGlobalKeyDown).toHaveBeenCalledOnce();
    expect(onKeyUp).toHaveBeenCalledOnce();
    expect(onWindowBlur).toHaveBeenCalledOnce();
  });
});
