/**
 * Uploaded TXT datasets: validation and reading. Files are read locally with
 * the File API; nothing is transmitted anywhere.
 */
export const MAX_UPLOADS = 4;
export const MAX_WORDS = 12_000;

export class UploadError extends Error {}

export interface UploadedText {
  fileName: string;
  text: string;
  roughWords: number;
}

export const roughWordCount = (text: string) => (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;

export async function readTxt(file: File): Promise<UploadedText> {
  if (!/\.txt$/i.test(file.name)) throw new UploadError(`${file.name}: only .txt files are supported.`);
  if (file.size > 2_000_000) throw new UploadError(`${file.name}: file is too large (over 2 MB).`);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new UploadError(`${file.name}: not valid UTF-8 text. Re-save the file as UTF-8 and try again.`);
  }
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const roughWords = roughWordCount(text);
  if (roughWords === 0) throw new UploadError(`${file.name}: the file contains no words.`);
  if (roughWords > MAX_WORDS) {
    throw new UploadError(`${file.name}: about ${roughWords.toLocaleString()} words; the limit is ${MAX_WORDS.toLocaleString()} per dataset. Please split or shorten the file.`);
  }
  return { fileName: file.name, text, roughWords };
}
