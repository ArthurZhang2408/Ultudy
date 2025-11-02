export function formatEmbeddingForInsert(vector) {
  if (!Array.isArray(vector) && !(vector instanceof Float32Array)) {
    throw new Error('Embedding must be an array or Float32Array');
  }

  const arr = Array.from(vector, (value) => Number.parseFloat(value.toFixed(6)));
  return `[${arr.join(',')}]`;
}

export default formatEmbeddingForInsert;
