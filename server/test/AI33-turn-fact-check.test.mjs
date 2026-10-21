/**
 * AI-33 — the turn probe must not turn a correct answer into a failure, or a wrong one into
 * a pass.
 *
 * THE TWO FAILURES THIS PINS, both measured 2026-10-21 on the same tenant:
 *
 *   * Lightning answered question 1 with "none are out of stock" — exact, and reported as
 *     `MISSING 0` because the old check looked for the literal digit;
 *   * the old check was a substring test, so an expected `2` also matched `1281`, `12` and
 *     `24`. That direction is worse: a false FAIL costs an afternoon, a false PASS hides a
 *     defect.
 *
 * Numbers are therefore compared as whole numbers, and zero also accepts the words a person
 * writes for it. Text facts still compare after whitespace and case normalization.
 */

import { it, describe } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';
import { factPresent, normalizeFact } from '../scripts/perf/factCheck.mjs';

unitSuite('AI-33 turn-probe fact check (DB-free)', () => {
  describe('numbers are compared as whole numbers', () => {
    it('★ accepts an exact count, with or without a thousands separator', () => {
      assert.equal(factPresent('You have 2 products to restock.', 2), true);
      assert.equal(factPresent('There are 1,281 units on hand.', 1281), true);
      assert.equal(factPresent('There are 1281 units on hand.', 1281), true);
    });

    it('★ does NOT match a digit inside a longer number', () => {
      assert.equal(factPresent('There are 12 products.', 2), false);
      assert.equal(factPresent('There are 1281 units.', 2), false);
      assert.equal(factPresent('There are 64 units.', 6), false);
      assert.equal(factPresent('There are 12812 units.', 1281), false);
    });

    it('★ matches a decimal only as the whole decimal', () => {
      assert.equal(factPresent('That is 16.7% of the catalogue.', 16.7), true);
      assert.equal(factPresent('That is 116.7% of the catalogue.', 16.7), false);
    });
  });

  describe('zero is also a word', () => {
    it('★ accepts the digit and every ordinary way of saying none', () => {
      for (const answer of [
        '0 products are out of stock.',
        'None are out of stock.',
        'There are no products out of stock.',
        'There are no out-of-stock products.',
        'Nothing is out of stock.',
        'Zero products are out of stock.',
      ]) {
        assert.equal(factPresent(answer, 0), true, answer);
      }
    });

    it('★ does not turn a ten into a zero', () => {
      assert.equal(factPresent('There are 10 products.', 0), false);
      assert.equal(factPresent('There are 100 units.', 0), false);
    });

    it('★ does not turn "none" into a claim about a non-zero expectation', () => {
      assert.equal(factPresent('None are out of stock.', 2), false);
    });
  });

  describe('text facts survive formatting', () => {
    it('★ matches a product name across whitespace and case', () => {
      assert.equal(factPresent('The product is **Pro Cable 1000** (SKU SEEDSKU-0).', 'Pro Cable 1000'), true);
      assert.equal(factPresent('The product is pro cable 1000.', 'Pro Cable 1000'), true);
      assert.equal(factPresent('The product is Pro Cable 1000.', 'Pro Cable 1001'), false);
    });

    it('is total over an empty answer or an empty expectation', () => {
      assert.equal(factPresent('', 2), false);
      assert.equal(factPresent('', ''), false);
      assert.equal(factPresent('anything', null), false);
    });
  });

  it('normalization is only about formatting, never about value', () => {
    assert.equal(normalizeFact(' 1,281\u00a0units '), '1281units');
    assert.equal(normalizeFact('Pro   Cable'), 'procable');
  });
});
