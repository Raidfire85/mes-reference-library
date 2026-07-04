export interface TextPosition {
  line: number;
  character: number;
}

export interface TextRange {
  start: TextPosition;
  end: TextPosition;
}

export interface PlainTextEdit {
  range: TextRange;
  newText: string;
}

export function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length - 1;
}

export function columnAt(text: string, index: number): number {
  const before = text.slice(0, index);
  const lineStart = before.lastIndexOf('\n') + 1;
  return index - lineStart;
}

export function positionAt(text: string, line: number, character: number): TextPosition {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < line; i++) {
    offset += lines[i].length + (text.includes('\r\n') ? 2 : 1);
  }
  return positionAtOffset(text, offset + character);
}

export function positionAtOffset(text: string, offset: number): TextPosition {
  const normalized = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? 2 : 1;
  let remaining = Math.max(0, offset);

  for (let line = 0; line < normalized.length; line++) {
    const lineLength = normalized[line].length;
    if (remaining <= lineLength) {
      return { line, character: remaining };
    }
    remaining -= lineLength + eol;
  }

  const lastLine = Math.max(0, normalized.length - 1);
  return { line: lastLine, character: normalized[lastLine]?.length ?? 0 };
}

export function offsetAt(text: string, position: TextPosition): number {
  const lines = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? 2 : 1;
  let offset = 0;
  for (let i = 0; i < position.line; i++) {
    offset += lines[i].length + eol;
  }
  return offset + position.character;
}

export function fullLineRange(text: string, line: number): TextRange | null {
  const lines = text.split(/\r?\n/);
  if (line < 0 || line >= lines.length) {
    return null;
  }

  const start = positionAt(text, line, 0);
  const lineText = lines[line];
  let endOffset = 0;
  for (let i = 0; i < line; i++) {
    endOffset += lines[i].length + (text.includes('\r\n') ? 2 : 1);
  }
  endOffset += lineText.length;
  if (line < lines.length - 1) {
    endOffset += text.includes('\r\n') ? 2 : 1;
  }

  return { start, end: positionAtOffset(text, endOffset) };
}
