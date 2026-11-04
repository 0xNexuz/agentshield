// A minimal Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0).
// Implements initialize, ping, tools/list, tools/call and server-to-client elicitation.
// Kept dependency-free on purpose: a payment tool should have as little code under it as possible.
// tests/mcp-server.test.mjs checks it against the official MCP SDK client.
import readline from 'node:readline';

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);

// Validates tool arguments against the small JSON Schema subset the tools use.
export function validateArguments(schema, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'Arguments must be an object.';
  const properties = schema.properties ?? {};
  for (const name of schema.required ?? []) if (!(name in args)) return `Missing required argument: ${name}.`;
  for (const [name, value] of Object.entries(args)) {
    const rule = properties[name];
    if (!rule) { if (schema.additionalProperties === false) return `Unknown argument: ${name}.`; continue; }
    if (rule.type === 'string') {
      if (typeof value !== 'string') return `${name} must be a string.`;
      if (rule.maxLength !== undefined && [...value].length > rule.maxLength) return `${name} is longer than ${rule.maxLength} characters.`;
      if (rule.pattern && !new RegExp(rule.pattern, 'u').test(value)) return `${name} has an invalid format.`;
      if (rule.enum && !rule.enum.includes(value)) return `${name} must be one of: ${rule.enum.join(', ')}.`;
    } else if (rule.type === 'boolean' && typeof value !== 'boolean') return `${name} must be true or false.`;
  }
  return null;
}

const asContent = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(value && typeof value === 'object' ? { structuredContent: value } : {}),
  isError,
});

export function createMcpServer({ name, version, instructions, tools, requestTimeoutMs = 300_000 }) {
  let clientCapabilities = {};
  let write = () => {};
  let nextId = 1;
  const pending = new Map();

  const reply = (id, result) => write({ jsonrpc: '2.0', id, result });
  const replyError = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

  // Sends a request to the client (e.g. elicitation/create) and waits for its answer.
  function requestClient(method, params) {
    const id = `agentshield-${nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`No answer from the client to ${method}`)); }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      write({ jsonrpc: '2.0', id, method, params });
    });
  }

  const context = {
    get canElicit() { return Boolean(clientCapabilities.elicitation); },
    elicit: params => requestClient('elicitation/create', params),
  };

  async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
      return replyError(null, -32600, 'Invalid request');
    }
    if (message.method === undefined) { // a response to one of our requests
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      return message.error ? waiting.reject(new Error(message.error.message ?? 'Client error')) : waiting.resolve(message.result);
    }
    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;
    if (isNotification) return; // notifications/initialized, notifications/cancelled: nothing to answer
    switch (method) {
      case 'initialize': {
        clientCapabilities = params?.capabilities ?? {};
        const requested = params?.protocolVersion;
        return reply(id, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version },
          ...(instructions ? { instructions } : {}),
        });
      }
      case 'ping': return reply(id, {});
      case 'tools/list':
        return reply(id, { tools: tools.map(({ name: toolName, title, description, inputSchema, annotations }) =>
          ({ name: toolName, title, description, inputSchema, annotations })) });
      case 'tools/call': {
        const tool = tools.find(item => item.name === params?.name);
        if (!tool) return replyError(id, -32602, `Unknown tool: ${params?.name}`);
        const args = params.arguments ?? {};
        const invalid = validateArguments(tool.inputSchema, args);
        if (invalid) return reply(id, asContent(invalid, true));
        try { return reply(id, asContent(await tool.handler(args, context))); }
        catch (error) { return reply(id, asContent(`${tool.name} failed: ${error.message}`, true)); }
      }
      default: return replyError(id, -32601, `Method not found: ${method}`);
    }
  }

  function connect(input = process.stdin, output = process.stdout) {
    write = message => output.write(`${JSON.stringify(message)}\n`);
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    lines.on('line', line => {
      if (!line.trim()) return;
      let message;
      try { message = JSON.parse(line); } catch { return replyError(null, -32700, 'Parse error'); }
      handle(message).catch(error => process.stderr.write(`agentshield-mcp: ${error.message}\n`));
    });
    return lines;
  }

  return { connect, handle, context, setWriter(fn) { write = fn; } };
}
