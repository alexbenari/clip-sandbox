import { describe, expect, test, vi } from 'vitest';
import { bindControlEvents, bindGlobalEvents, isEditableTarget } from '../../../src/app/event-binding.js';

describe('app event binding module', () => {
  test('detects editable targets', () => {
    document.body.innerHTML = '<input id="a" /><div id="b"></div>';
    expect(isEditableTarget(document.getElementById('a'))).toBe(true);
    expect(isEditableTarget(document.getElementById('b'))).toBe(false);
  });

  test('wires each control to its matching handler only', () => {
    document.body.innerHTML = `
      <button id="pick"></button>
      <input id="folder" />
      <button id="save"></button>
      <button id="saveAsNew"></button>
      <button id="load"></button>
      <input id="order" />
      <button id="toggle"></button>
      <button id="fs"></button>
    `;
    const onPickFolder = vi.fn();
    const onFolderInputChange = vi.fn();
    const onSaveOrder = vi.fn();
    const onSaveAsNew = vi.fn();
    const onLoadOrderClick = vi.fn();
    const onOrderFileChange = vi.fn();
    const onToggleTitles = vi.fn();
    const onFsToggle = vi.fn();

    bindControlEvents({
      pickBtn: document.getElementById('pick'),
      folderInput: document.getElementById('folder'),
      saveBtn: document.getElementById('save'),
      saveAsNewBtn: document.getElementById('saveAsNew'),
      loadOrderBtn: document.getElementById('load'),
      orderFileInput: document.getElementById('order'),
      toggleTitlesBtn: document.getElementById('toggle'),
      fsBtn: document.getElementById('fs'),
      onPickFolder,
      onFolderInputChange,
      onSaveOrder,
      onSaveAsNew,
      onLoadOrderClick,
      onOrderFileChange,
      onToggleTitles,
      onFsToggle,
    });

    document.getElementById('pick').click();
    document.getElementById('folder').dispatchEvent(new Event('change'));
    document.getElementById('save').click();
    document.getElementById('saveAsNew').click();
    document.getElementById('load').click();
    document.getElementById('order').dispatchEvent(new Event('change'));
    document.getElementById('toggle').click();
    document.getElementById('fs').click();

    expect(onPickFolder).toHaveBeenCalledOnce();
    expect(onFolderInputChange).toHaveBeenCalledOnce();
    expect(onSaveOrder).toHaveBeenCalledOnce();
    expect(onSaveAsNew).toHaveBeenCalledOnce();
    expect(onLoadOrderClick).toHaveBeenCalledOnce();
    expect(onOrderFileChange).toHaveBeenCalledOnce();
    expect(onToggleTitles).toHaveBeenCalledOnce();
    expect(onFsToggle).toHaveBeenCalledOnce();
  });

  test('skips optional save-as-new binding when the button is absent', () => {
    document.body.innerHTML = `
      <button id="pick"></button>
      <input id="folder" />
      <button id="save"></button>
      <button id="load"></button>
      <input id="order" />
      <button id="toggle"></button>
      <button id="fs"></button>
    `;
    const onPickFolder = vi.fn();
    const onFolderInputChange = vi.fn();
    const onSaveOrder = vi.fn();
    const onSaveAsNew = vi.fn();
    const onLoadOrderClick = vi.fn();
    const onOrderFileChange = vi.fn();
    const onToggleTitles = vi.fn();
    const onFsToggle = vi.fn();

    expect(() =>
      bindControlEvents({
        pickBtn: document.getElementById('pick'),
        folderInput: document.getElementById('folder'),
        saveBtn: document.getElementById('save'),
        saveAsNewBtn: null,
        loadOrderBtn: document.getElementById('load'),
        orderFileInput: document.getElementById('order'),
        toggleTitlesBtn: document.getElementById('toggle'),
        fsBtn: document.getElementById('fs'),
        onPickFolder,
        onFolderInputChange,
        onSaveOrder,
        onSaveAsNew,
        onLoadOrderClick,
        onOrderFileChange,
        onToggleTitles,
        onFsToggle,
      })
    ).not.toThrow();

    document.getElementById('pick').click();
    document.getElementById('save').click();
    document.getElementById('load').click();
    document.getElementById('toggle').click();
    document.getElementById('fs').click();

    expect(onPickFolder).toHaveBeenCalledOnce();
    expect(onSaveOrder).toHaveBeenCalledOnce();
    expect(onLoadOrderClick).toHaveBeenCalledOnce();
    expect(onToggleTitles).toHaveBeenCalledOnce();
    expect(onFsToggle).toHaveBeenCalledOnce();
    expect(onSaveAsNew).not.toHaveBeenCalled();
    expect(onFolderInputChange).not.toHaveBeenCalled();
    expect(onOrderFileChange).not.toHaveBeenCalled();
  });

  test('binds global events', () => {
    const onFsChange = vi.fn();
    const onResize = vi.fn();
    const onKeyDown = vi.fn();
    const onGlobalKeyDown = vi.fn();
    bindGlobalEvents({ onFsChange, onResize, onKeyDown, onGlobalKeyDown });

    document.dispatchEvent(new Event('fullscreenchange'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

    expect(onFsChange).toHaveBeenCalled();
    expect(onResize).toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalled();
    expect(onGlobalKeyDown).toHaveBeenCalled();
  });
});
