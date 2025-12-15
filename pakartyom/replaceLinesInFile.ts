import {readFile, writeFile} from 'node:fs/promises';

export type ReplaceLinesReplacement = string | readonly string[];

function toLines(text: string): string[] {
	if (text === '') return [''];
	const parts = text.split(/\r?\n/);
	if (text.endsWith('\n')) parts.pop();
	return parts;
}

function detectNewline(text: string): '\n' | '\r\n' {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

export function replaceLines(
	lines: readonly string[],
	fromLine: number,
	toLine: number,
	replacementLines: readonly string[],
): string[] {
	if (!Number.isInteger(fromLine) || !Number.isInteger(toLine)) {
		throw new TypeError('fromLine/toLine must be integers (1-based).');
	}
	if (fromLine < 1) {
		throw new RangeError('fromLine must be >= 1 (1-based).');
	}
	if (toLine < fromLine) {
		throw new RangeError('toLine must be >= fromLine.');
	}
	if (toLine > lines.length) {
		throw new RangeError(
			`toLine is out of range: file has ${lines.length} lines, got toLine=${toLine}.`,
		);
	}

	return [
		...lines.slice(0, fromLine - 1),
		...replacementLines,
		...lines.slice(toLine),
	];
}

export async function replaceLinesInFile(
	filePath: string,
	fromLine: number,
	toLine: number,
	replacement: ReplaceLinesReplacement,
	options: {encoding?: BufferEncoding} = {},
): Promise<void> {
	const encoding = options.encoding ?? 'utf8';
	const originalText = await readFile(filePath, {encoding});
	const newline = detectNewline(originalText);
	const hasFinalNewline = originalText.endsWith('\n');

	let fileLines = originalText === '' ? [] : originalText.split(/\r?\n/);
	if (hasFinalNewline) fileLines = fileLines.slice(0, -1);

	const replacementLines = Array.isArray(replacement)
		? [...replacement]
		: toLines(replacement);

	const nextLines = replaceLines(fileLines, fromLine, toLine, replacementLines);
	let nextText = nextLines.join(newline);
	if (hasFinalNewline) nextText += newline;

	if (nextText !== originalText) {
		await writeFile(filePath, nextText, {encoding});
	}
}

