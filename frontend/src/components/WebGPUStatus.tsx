interface Props {
  device: string | null;
  loading: boolean;
}

export function WebGPUStatus({ device, loading }: Props) {
  if (loading) {
    return (
      <div className="badge badge-loading">
        <span className="dot dot-pulse" />
        Loading model...
      </div>
    );
  }

  if (!device) {
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
