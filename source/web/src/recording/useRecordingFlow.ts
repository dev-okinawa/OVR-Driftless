import { useCallback, useEffect, useRef, useState } from 'react';
import type { Recording } from './format';
import { openRecordingFile, RecordingFileError, saveRecordingToFile } from './files';
import type { Recorder } from './recorder';

/** What the user sees of saving and opening recordings. */
export interface RecordingFlow {
  /** A recording is being written to disk. */
  readonly saving: boolean;
  /** The last recording could not be saved and is kept in memory; null when there is none. */
  readonly unsaved: { readonly recording: Recording; readonly reason: string } | null;
  /** The save-error dialog was dismissed without a decision. */
  readonly saveErrorDeferred: boolean;
  readonly discardRequested: boolean;
  /** The chosen file that cannot be opened and why; null when there is no error to show. */
  readonly fileError: { readonly fileName: string; readonly reason: string } | null;
  stop(): void;
  saveAgain(): void;
  deferSaveError(): void;
  reopenSaveError(): void;
  requestDiscard(): void;
  cancelDiscard(): void;
  discard(): void;
  openFile(): void;
  dismissFileError(): void;
}

export interface RecordingFlowCallbacks {
  /** A recording was written to disk under this name. */
  readonly onSaved: (fileName: string) => void;
  /** The user chose a valid recording file. */
  readonly onOpen: (recording: Recording, fileName: string) => void;
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? `${fallback}: ${error.message}.` : `${fallback}.`;
}

/** Stopping, saving, discarding and opening recordings, with the failures each step can report. */
export function useRecordingFlow(recorder: Recorder, callbacks: RecordingFlowCallbacks): RecordingFlow {
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState<RecordingFlow['unsaved']>(null);
  const [saveErrorDeferred, setSaveErrorDeferred] = useState(false);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [fileError, setFileError] = useState<RecordingFlow['fileError']>(null);
  // Read by async continuations, which must not call a stale callback.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const save = useCallback(async (recording: Recording): Promise<void> => {
    setSaving(true);
    try {
      const fileName = await saveRecordingToFile(recording);
      if (fileName === null) {
        // The user cancelled: keep the recording, without an error dialog.
        setUnsaved({ recording, reason: 'The save was cancelled.' });
        setSaveErrorDeferred(true);
        return;
      }
      setUnsaved(null);
      callbacksRef.current.onSaved(fileName);
    } catch (error) {
      setUnsaved({ recording, reason: describe(error, 'The recording could not be saved') });
      setSaveErrorDeferred(false);
    } finally {
      setSaving(false);
    }
  }, []);

  const openFile = useCallback(async (): Promise<void> => {
    setFileError(null);
    try {
      const file = await openRecordingFile();
      if (file) callbacksRef.current.onOpen(file.recording, file.name);
    } catch (error) {
      if (error instanceof RecordingFileError) setFileError({ fileName: error.fileName, reason: error.message });
      else setFileError({ fileName: 'The file', reason: describe(error, 'It could not be read') });
    }
  }, []);

  return {
    saving,
    unsaved,
    saveErrorDeferred,
    discardRequested,
    fileError,
    stop: () => void save(recorder.stop()),
    saveAgain: () => {
      if (unsaved) void save(unsaved.recording);
    },
    deferSaveError: () => setSaveErrorDeferred(true),
    reopenSaveError: () => setSaveErrorDeferred(false),
    requestDiscard: () => setDiscardRequested(true),
    cancelDiscard: () => setDiscardRequested(false),
    discard: () => {
      setUnsaved(null);
      setDiscardRequested(false);
    },
    openFile: () => void openFile(),
    dismissFileError: () => setFileError(null),
  };
}
