import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from './resolve-config.mjs';

test('project commands override workspace commands and preserve other keys', () => {
  const effective = resolveConfig({
    workspace: {
      metadata: { id: 'workspace' },
      platforms: {
        common: {
          commands: {
            review: { content: 'workspace review' },
            test: { content: 'workspace test' },
          },
        },
      },
    },
    project: {
      metadata: { workspaceRef: 'workspace' },
      platforms: {
        common: {
          commands: {
            review: { content: 'project review' },
          },
        },
      },
    },
  });

  assert.equal(effective.platforms.common.commands.review.content, 'project review');
  assert.equal(effective.platforms.common.commands.test.content, 'workspace test');
});

test('append strategy concatenates instructions', () => {
  const effective = resolveConfig({
    workspace: {
      metadata: { id: 'workspace' },
      platforms: {
        common: {
          instructions: {
            strategy: 'replace',
            content: 'workspace instructions',
          },
        },
      },
    },
    project: {
      metadata: { workspaceRef: 'workspace' },
      platforms: {
        common: {
          instructions: {
            strategy: 'append',
            content: 'project instructions',
          },
        },
      },
    },
  });

  assert.equal(
    effective.platforms.common.instructions.content,
    'workspace instructions\n\nproject instructions'
  );
});

test('disabled project entries mask inherited workspace entries', () => {
  const effective = resolveConfig({
    workspace: {
      metadata: { id: 'workspace' },
      platforms: {
        common: {
          commands: {
            test: { content: 'workspace test' },
          },
        },
      },
    },
    project: {
      metadata: { workspaceRef: 'workspace' },
      platforms: {
        common: {
          commands: {
            test: { disabled: true },
          },
        },
      },
    },
  });

  assert.equal(effective.platforms.common, undefined);
});

test('narrow domain mode intersects workspace and project allowlists', () => {
  const effective = resolveConfig({
    workspace: {
      metadata: { id: 'workspace' },
      policy: {
        domains: {
          mode: 'union',
          allow: ['github.com', 'api.github.com', 'openai.com'],
        },
      },
    },
    project: {
      metadata: { workspaceRef: 'workspace' },
      policy: {
        domains: {
          mode: 'narrow',
          allow: ['github.com', 'example.com'],
        },
      },
    },
  });

  assert.deepEqual(effective.policy.domains.allow, ['github.com']);
});
