import { describe, expect, it } from 'vitest';
import { extractDriveFileId, extractDriveFolderId } from '../src/services/googleDriveService';

describe('extractDriveFolderId', () => {
  it('reads the id from a shared folder link', () => {
    expect(extractDriveFolderId('https://drive.google.com/drive/folders/1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL'))
      .toBe('1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL');
  });

  it('tolerates sharing query strings and surrounding whitespace', () => {
    expect(extractDriveFolderId('  https://drive.google.com/drive/folders/1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL?usp=sharing  '))
      .toBe('1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL');
  });

  it('returns null for a file link', () => {
    expect(extractDriveFolderId('https://drive.google.com/file/d/1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL/view'))
      .toBeNull();
  });
});

describe('extractDriveFileId', () => {
  it('reads the id from a file link', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL/view?usp=sharing'))
      .toBe('1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL');
  });

  it('reads the id from a download link', () => {
    expect(extractDriveFileId('https://drive.google.com/uc?export=download&id=1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL'))
      .toBe('1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL');
  });

  it('accepts a bare id', () => {
    expect(extractDriveFileId('1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL'))
      .toBe('1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL');
  });

  it('refuses a folder link, so folders are not downloaded as a file', () => {
    expect(extractDriveFileId('https://drive.google.com/drive/folders/1W5TDnO5gQtw7qiu_hoSTzx1FuLaflIqL'))
      .toBeNull();
  });

  it('returns null for unrelated text', () => {
    expect(extractDriveFileId('não é um link')).toBeNull();
    expect(extractDriveFileId('')).toBeNull();
  });
});
