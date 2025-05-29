// Minimal WASM interop test: double_array, add_one, greet

jest.mock('../../wasm_kernel/pkg/wasm_kernel.js', () => ({}));

describe('wasm minimal', () => {
  it('add_one increments integer', async () => {
    const wasm = await import('../../wasm_kernel/pkg/wasm_kernel.js');
    expect(wasm.add_one(41)).toBe(42);
    expect(wasm.add_one(-1)).toBe(0);
  });

  it('greet returns greeting string', async () => {
    const wasm = await import('../../wasm_kernel/pkg/wasm_kernel.js');
    expect(wasm.greet('Brian')).toBe('Hello, Brian!');
    expect(wasm.greet('世界')).toBe('Hello, 世界!');
  });

  it('double_array doubles all values', async () => {
    const wasm = await import('../../wasm_kernel/pkg/wasm_kernel.js');
    const arr = new Float32Array([1, 2, 3, 4]);
    const doubled = wasm.double_array(arr);
    expect(Array.from(doubled)).toEqual([2, 4, 6, 8]);
  });
});
