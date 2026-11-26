import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { accents, palette } from '../src/styles/theme.js';
import { fieldGuide } from '../src/utils/fieldGuide.js';

test('missing and invalid preferences use the brand palette, dark accents stay legible', () => {
  assert.deepEqual(palette(), palette(accents.lilac));
  assert.deepEqual(palette('invalid'), palette(accents.lilac));
  assert.equal(palette(accents.blue).accent, accents.blue);
  assert.notEqual(palette('#000000').accent, '#000000');
});

test('each chapter has localized screenshots that ship with the guide', async () => {
  for (const [language, chapters] of Object.entries(fieldGuide)) {
    for (const [name, , , sections] of chapters) {
      const images = sections.filter(section => section[2]);
      assert.ok(images.length, name);
      for (const [, , key, caption] of images) {
        assert.ok(caption, key);
        await access(new URL('../docs/figuras/' + language + '-' + key + '.png', import.meta.url));
      }
    }
  }
});
