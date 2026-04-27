import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EndpointEditor } from './EndpointEditor';
import type { EndpointCreateRequest } from '../../types';

vi.mock('next/dynamic', () => ({
  default: () =>
    function MockScriptEditor() {
      return <div data-testid="mock-script-editor" />;
    },
}));

const baseForm: EndpointCreateRequest = {
  name: 'Demo endpoint',
  method: 'POST',
  endpointType: 'webhook',
  auth: 'public',
};

function renderEditor(form: EndpointCreateRequest) {
  return render(
    <EndpointEditor form={form} onUpdateForm={vi.fn()} onRun={vi.fn()} onSave={vi.fn()} />
  );
}

describe('EndpointEditor', () => {
  it('uses theme-aware editor shells for webhook transform code', () => {
    renderEditor({
      ...baseForm,
      webhookConfig: {
        targetUrl: 'https://example.com/hook',
        transformBody: 'return input;',
      },
    });

    const transformEditor = screen.getByPlaceholderText('// return { name: input.fullName };');
    const shell = transformEditor.parentElement;

    expect(shell).toHaveClass('bg-card');
    expect(shell?.className).not.toContain('bg-[#1e1e2e]');
    expect(transformEditor).toHaveClass('text-foreground');
    expect(transformEditor.className).not.toContain('text-[#cdd6f4]');
  });

  it('uses theme-aware editor shells for logic code areas', () => {
    renderEditor({
      ...baseForm,
      endpointType: 'logic',
      logicConfig: {
        requestSchema: '{ "type": "object" }',
        handlerCode: 'return { statusCode: 200 };',
        responseMapping: '{ "status": 200 }',
      },
    });

    const logicEditors = [
      screen.getByPlaceholderText('{ "type": "object", "required": ["user_id"] }'),
      screen.getByPlaceholderText("return { statusCode: 200, body: { status: 'ok' } };"),
      screen.getByPlaceholderText('{ "status": 200, "headers": { "X-Server-Mon": "active" } }'),
    ];

    for (const editor of logicEditors) {
      expect(editor.parentElement).toHaveClass('bg-card');
      expect(editor.parentElement?.className).not.toContain('bg-[#1e1e2e]');
      expect(editor).toHaveClass('text-foreground');
      expect(editor.className).not.toContain('text-[#cdd6f4]');
    }
  });
});
