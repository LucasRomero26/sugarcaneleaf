export type ModelState = 'idle' | 'loading' | 'ready' | 'error';

interface Props {
  device: string | null;
  state: ModelState;
}

export function WebGPUStatus({ device, state }: Props) {
  if (state === 'idle') {
    return <div className="badge badge-loading">Model loads on first use</div>;
  }

  if (state === 'loading') {
    return (
      <div className="badge badge-loading">
        <span className="dot dot-pulse" />
        Loading model...
      </div>
    );
  }

  if (state === 'error' || !device) {
    return <div className="badge badge-error">Model not loaded</div>;
  }

  const isGPU = device === 'webgpu';
  return (
    <div className={`badge ${isGPU ? 'badge-gpu' : 'badge-cpu'}`}>
      <span className={`dot ${isGPU ? 'dot-gpu' : 'dot-cpu'}`} />
      {isGPU ? 'WebGPU' : device === 'wasm' ? 'WASM fallback' : 'CPU'}
    </div>
  );
}
