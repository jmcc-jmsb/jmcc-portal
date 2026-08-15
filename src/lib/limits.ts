// ABOUTME: Submission limits, shared by the server that enforces them and the UI that states them.
// ABOUTME: Deliberately free of env imports so it is safe on both sides of the wire.

/* DESIGN_BRIEF §5.7 state 3 asks for "accepted formats listed, file size cap
   stated" without naming either, so these are a judgement call and deliberately
   generous — a team that loses a deadline to a rejected .key file has been
   failed by us, not by the rule.

   One module rather than a constant in each place: a UI that advertises a limit
   the server does not honour is worse than no limit stated at all. */
export const ALLOWED_SUBMISSION_EXTENSIONS = [
  'pdf', 'pptx', 'ppt', 'key', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'zip', 'png', 'jpg', 'jpeg',
];

export const MAX_SUBMISSION_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_SUBMISSION_FILES = 12;

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Returns null when the file is acceptable, or a reason code when it is not. */
export function rejectSubmissionFile(file: { name: string; size: number }): 'type' | 'size' | 'empty' | null {
  if (file.size === 0) return 'empty';
  if (file.size > MAX_SUBMISSION_FILE_BYTES) return 'size';
  if (!ALLOWED_SUBMISSION_EXTENSIONS.includes(extensionOf(file.name))) return 'type';
  return null;
}
