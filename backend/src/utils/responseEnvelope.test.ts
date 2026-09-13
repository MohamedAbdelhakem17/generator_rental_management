import { describe, expect, it } from 'vitest';

import { errorResponse, successResponse } from './responseEnvelope.js';

describe('response envelope', () => {
  it('builds a success envelope with defaults', () => {
    expect(successResponse({ id: '1' })).toEqual({
      success: true,
      data: { id: '1' },
      message: null,
      meta: {},
    });
  });

  it('builds a success envelope with a message and meta', () => {
    expect(successResponse([1, 2], 'ok', { page: 1 })).toEqual({
      success: true,
      data: [1, 2],
      message: 'ok',
      meta: { page: 1 },
    });
  });

  it('builds an error envelope with data always null', () => {
    expect(errorResponse('Not found')).toEqual({
      success: false,
      data: null,
      message: 'Not found',
      errors: [],
    });
  });

  it('builds an error envelope with field-level errors', () => {
    expect(errorResponse('Validation failed', [{ field: 'name', message: 'Required' }])).toEqual({
      success: false,
      data: null,
      message: 'Validation failed',
      errors: [{ field: 'name', message: 'Required' }],
    });
  });
});
