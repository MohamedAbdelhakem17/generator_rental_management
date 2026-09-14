/**
 * Disallows Tailwind classes that hardcode a physical left/right direction, since the
 * app must mirror correctly under dir="rtl" (TASK-004 FR-001). Use the logical
 * equivalents instead: ms-/me- (margin), ps-/pe- (padding), start-/end- (position),
 * border-s-/border-e-, rounded-s-/rounded-e-, text-start/text-end.
 */

// These already end in '-', so any suffix after them is banned (ml-4, ml-auto, left-2, ...).
const PREFIX_MATCH = ['ml-', 'mr-', 'pl-', 'pr-', 'left-', 'right-'];

// These need a word boundary: "rounded-l" must not match "rounded-lg" (a large radius,
// nothing to do with the left side). Matches the bare token itself or `${token}-...`.
const BOUNDARY_MATCH = [
  'text-left',
  'text-right',
  'float-left',
  'float-right',
  'clear-left',
  'clear-right',
  'border-l',
  'border-r',
  'rounded-l',
  'rounded-r',
  'rounded-tl',
  'rounded-tr',
  'rounded-bl',
  'rounded-br',
];

function bannedPrefixFor(token) {
  const withoutVariants = token.includes(':') ? token.split(':').pop() : token;
  const bare = withoutVariants.replace(/^-/, '');
  const prefixHit = PREFIX_MATCH.find((prefix) => bare.startsWith(prefix));
  if (prefixHit) return prefixHit;
  return BOUNDARY_MATCH.find((prefix) => bare === prefix || bare.startsWith(`${prefix}-`));
}

function isClassNameAttribute(node) {
  return node.type === 'JSXAttribute' && (node.name.name === 'className' || node.name.name === 'class');
}

function isClassHelperCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    ['cn', 'clsx', 'cva', 'twMerge'].includes(node.callee.name)
  );
}

function isInClassContext(node) {
  let current = node.parent;
  while (current) {
    if (isClassNameAttribute(current) || isClassHelperCall(current)) return true;
    current = current.parent;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow physical-direction Tailwind classes; use logical (ms-/me-/ps-/pe-/start-/end-) equivalents.',
    },
    schema: [],
    messages: {
      physicalClass:
        '"{{token}}" hardcodes a physical direction and will not mirror in RTL. Use the logical equivalent (ms-/me-, ps-/pe-, start-/end-, border-s-/border-e-, rounded-s-/rounded-e-, text-start/text-end).',
    },
  },
  create(context) {
    function check(node, raw) {
      if (typeof raw !== 'string') return;
      for (const token of raw.split(/\s+/).filter(Boolean)) {
        const prefix = bannedPrefixFor(token);
        if (prefix) {
          context.report({ node, messageId: 'physicalClass', data: { token } });
          return;
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && isInClassContext(node)) check(node, node.value);
      },
      TemplateElement(node) {
        if (isInClassContext(node)) check(node, node.value.raw);
      },
    };
  },
};
