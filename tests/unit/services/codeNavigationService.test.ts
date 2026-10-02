import { describe, expect, it } from 'vitest';
import { extractCodeSymbols, findSymbol } from '@/services/codeNavigationService';

describe('codeNavigationService', () => {
  it('提取常见类、函数和方法声明', () => {
    const symbols = extractCodeSymbols([
      'public class DemoService {',
      '  public DemoService() {}',
      '  public String evaluate(String input) {',
      '    return input;',
      '  }',
      '}',
    ].join('\n'));

    expect(findSymbol(symbols, 'DemoService')).toMatchObject({ kind: 'class', lineNumber: 1 });
    expect(findSymbol(symbols, 'evaluate')).toMatchObject({ kind: 'method', lineNumber: 3 });
  });

  it('支持 Python/JavaScript 常见函数声明并返回可悬浮签名', () => {
    const symbols = extractCodeSymbols('def load_data(source):\n  return source\nfunction render(value) { return value }');
    expect(findSymbol(symbols, 'load_data')).toMatchObject({ kind: 'function', lineNumber: 1 });
    expect(findSymbol(symbols, 'render')?.signature).toContain('function render');
  });

  it('支持 JavaScript 箭头函数和类中的无返回类型方法', () => {
    const symbols = extractCodeSymbols('const loadData = async (source) => source;\nclass View {\n  render(value) { return value }\n}');
    expect(findSymbol(symbols, 'loadData')).toMatchObject({ kind: 'function', lineNumber: 1 });
    expect(findSymbol(symbols, 'render')).toMatchObject({ kind: 'method', lineNumber: 3 });
  });

  it('忽略控制流表达式，避免误识别为方法', () => {
    const symbols = extractCodeSymbols('if (ready) {\n  run();\n}\nwhile (active) {}');
    expect(symbols).toEqual([]);
  });
});
