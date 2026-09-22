import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsv, detectDelimiter, parseCell, parseCsv, parseScheduleCsv, parseTime, parseWeekday } from './parse.mjs';

test('parseCell: VENDA / vazio / aluno', () => {
  assert.deepEqual(parseCell('VENDA'), { status: 'livre', name: null, code: null });
  assert.deepEqual(parseCell(' venda '), { status: 'livre', name: null, code: null });
  assert.deepEqual(parseCell(''), { status: 'indisponivel', name: null, code: null });
  assert.deepEqual(parseCell('   '), { status: 'indisponivel', name: null, code: null });
  assert.deepEqual(parseCell('luciano 1310'), { status: 'ocupado', name: 'luciano', code: '1310' });
  assert.deepEqual(parseCell('Ana Paula  22'), { status: 'ocupado', name: 'Ana Paula', code: '22' });
  assert.deepEqual(parseCell('maria - 907'), { status: 'ocupado', name: 'maria', code: '907' });
  assert.deepEqual(parseCell('joão'), { status: 'ocupado', name: 'joão', code: null });
  assert.deepEqual(parseCell('1310'), { status: 'ocupado', name: '1310', code: null });
  assert.deepEqual(parseCell('pedro 2x'), { status: 'ocupado', name: 'pedro 2x', code: null });
});

test('parseTime', () => {
  assert.equal(parseTime('6:00'), '06:00');
  assert.equal(parseTime('06:00'), '06:00');
  assert.equal(parseTime('6h'), '06:00');
  assert.equal(parseTime('6h30'), '06:30');
  assert.equal(parseTime('19:45'), '19:45');
  assert.equal(parseTime('6:00 às 7:00'), '06:00');
  assert.equal(parseTime('06:00 - 07:00'), '06:00');
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('manhã'), null);
  assert.equal(parseTime(''), null);
});

test('parseWeekday', () => {
  assert.equal(parseWeekday('SEGUNDA-FEIRA'), 1);
  assert.equal(parseWeekday('TERÇA-FEIRA'), 2);
  assert.equal(parseWeekday('Terca'), 2);
  assert.equal(parseWeekday('SÁBADO'), 6);
  assert.equal(parseWeekday('domingo'), 7);
  assert.equal(parseWeekday('HORÁRIO'), null);
});

test('delimitador e aspas', () => {
  assert.equal(detectDelimiter('a;b;c'), ';');
  assert.equal(detectDelimiter('a,b,c'), ',');
  assert.equal(detectDelimiter('a\tb'), '\t');
  assert.deepEqual(parseCsv('a;"b;x";"c ""q"""\r\nd;;e', ';'), [['a', 'b;x', 'c "q"'], ['d', '', 'e']]);
  assert.deepEqual(parseCsv('a;"linha1\nlinha2"', ';'), [['a', 'linha1 linha2']]);
});

test('decodeCsv: UTF-8 com BOM e Windows-1252', () => {
  assert.equal(decodeCsv(Buffer.from('﻿TERÇA', 'utf8')), 'TERÇA');
  assert.equal(decodeCsv(Buffer.from('TERÇA', 'latin1')), 'TERÇA');
});

test('parseScheduleCsv: planilha completa', () => {
  const csv = [
    'HORÁRIO;SEGUNDA-FEIRA;TERÇA-FEIRA;QUARTA-FEIRA;OBS',
    '6:00;VENDA;luciano 1310;;x',
    '7:00;;VENDA;marta;',
    ';;;;',
    'almoço;;;;',
    '20:00;VENDA;;;',
  ].join('\r\n');
  const r = parseScheduleCsv(csv);
  assert.deepEqual(r.weekdays.map((w) => w.weekday), [1, 2, 3]);
  assert.deepEqual(r.ignoredHeaders, ['OBS']);
  assert.deepEqual(r.rows.map((x) => x.time), ['06:00', '07:00', '20:00']);
  assert.equal(r.rows[0].cells.get(1).status, 'livre');
  assert.deepEqual(r.rows[0].cells.get(2), { status: 'ocupado', name: 'luciano', code: '1310', raw: 'luciano 1310' });
  assert.equal(r.rows[0].cells.get(3).status, 'indisponivel');
  assert.equal(r.rows[1].cells.get(3).name, 'marta');
  assert.equal(r.warnings.length, 1); // "almoço"
  assert.match(r.warnings[0], /almoço/);
});

test('parseScheduleCsv: erro sem cabeçalho e horário repetido', () => {
  assert.throws(() => parseScheduleCsv('a;b\n1;2'), /cabeçalho/);
  const r = parseScheduleCsv('H;SEGUNDA\n6:00;VENDA\n6:00;ana 1');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].cells.get(1).name, 'ana');
  assert.equal(r.warnings.length, 1);
});
