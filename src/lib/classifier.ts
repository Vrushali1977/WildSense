export interface Prediction {
  label: string;
  score: number;
}

export type ModelProgress = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

export type ModelState = 'not-loaded' | 'loading' | 'ready' | 'error';
export type ProgressListener = (progress: ModelProgress) => void;

type ClassifierPipeline = (image: Blob, options: { top_k: number }) => Promise<unknown>;
let classifierPromise: Promise<ClassifierPipeline> | undefined;
let state: ModelState = 'not-loaded';

export function getModelState(): ModelState {
  return state;
}

export function parsePredictions(raw: unknown): Prediction[] {
  if (!Array.isArray(raw)) throw new Error('The image classifier returned an unexpected response. Please retry.');
  const predictions = raw.flatMap((item): Prediction[] => {
    if (typeof item !== 'object' || item === null) return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.label !== 'string' || candidate.label.trim() === '' || typeof candidate.score !== 'number' || !Number.isFinite(candidate.score)) return [];
    return [{ label: candidate.label, score: Math.max(0, Math.min(1, candidate.score)) }];
  });
  if (predictions.length === 0) throw new Error('No usable predictions were returned for this image. Try a clearer photo.');
  return predictions;
}

async function loadClassifier(onProgress: ProgressListener): Promise<ClassifierPipeline> {
  state = 'loading';
  try {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
    const loaded = await pipeline('image-classification', 'Xenova/vit-base-patch16-224', {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (progress: ModelProgress) => onProgress(progress),
    });
    state = 'ready';
    return loaded as unknown as ClassifierPipeline;
  } catch (error) {
    classifierPromise = undefined;
    state = 'error';
    throw error;
  }
}

export async function classifyImage(image: Blob, onProgress: ProgressListener = () => undefined): Promise<Prediction[]> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('This browser cannot prepare photos for local image classification. Try an up-to-date browser with WebAssembly and OffscreenCanvas support.');
  }
  if (!classifierPromise) classifierPromise = loadClassifier(onProgress);
  const classifier = await classifierPromise;
  onProgress({ status: 'inference' });
  const bitmap = await createImageBitmap(image, { resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'high' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the selected photo. Try another browser or image.');
    context.drawImage(bitmap, 0, 0);
    const resizedImage = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const output = await classifier(resizedImage, { top_k: 5 });
    return parsePredictions(output);
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function resetClassifierForTests(): void {
  classifierPromise = undefined;
  state = 'not-loaded';
}
