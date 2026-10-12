// Word-level diff (longest common subsequence over whitespace-separated tokens).

export interface DiffOp {
  type: "same" | "del" | "add";
  text: string;
}

export function diffWords(before: string, after: string): DiffOp[] {
  const a = before.match(/\S+/g) ?? [];
  const b = after.match(/\S+/g) ?? [];
  const width = b.length + 1;
  // lcs[i * width + j] = LCS length of a[i:] and b[j:].
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * width + j] ?? 0, lcs[i * width + j + 1] ?? 0);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string) => {
    const last = ops.at(-1);
    if (last?.type === type) last.text += ` ${text}`;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("same", a[i] as string);
      i++;
      j++;
    } else if (
      j < b.length &&
      (i >= a.length || (lcs[i * width + j + 1] ?? 0) >= (lcs[(i + 1) * width + j] ?? 0))
    ) {
      push("add", b[j] as string);
      j++;
    } else {
      push("del", a[i] as string);
      i++;
    }
  }
  return ops;
}
