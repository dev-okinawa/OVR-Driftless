import { parseRecording, serializeRecording, type Recording } from './format';

// `showSaveFilePicker` and `showOpenFilePicker` are not in the standard DOM typings.
interface WritableFile {
  readonly name: string;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
interface FilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<WritableFile>;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function suggestedName(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `ovr-driftless-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jsonl`;
}

/** Lets the user choose where to save. Resolves with the file name, or null when the user cancels. */
export async function saveRecordingToFile(recording: Recording): Promise<string | null> {
  const text = serializeRecording(recording);
  const name = suggestedName();
  const picker = (window as unknown as FilePickerWindow).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description: 'Tracker recording', accept: { 'application/x-ndjson': ['.jsonl'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
}

/** A chosen file that could not be read or is not a recording; names the file and says why. */
export class RecordingFileError extends Error {
  constructor(
    readonly fileName: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : 'The file could not be read.');
    this.name = 'RecordingFileError';
  }
}

/** Opens a file dialog and parses the chosen file. Null when the user cancels. */
export function openRecordingFile(): Promise<{ name: string; recording: Recording } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,.json,application/x-ndjson,application/json';
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then((text) => {
        try {
          resolve({ name: file.name, recording: parseRecording(text) });
        } catch (error) {
          reject(new RecordingFileError(file.name, error));
        }
      }, (error: unknown) => reject(new RecordingFileError(file.name, error)));
    });
    input.click();
  });
}
