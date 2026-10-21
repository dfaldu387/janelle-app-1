import React, { Fragment, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Lightweight React Native Markdown renderer matching the web app's hand-written
 * parser. Handles the subset Claude actually returns: headings, bold, italic,
 * inline code, code blocks, lists, tables, blockquotes, links, and rules.
 */

const C = {
  ink: '#F1F5F9',
  inkSoft: '#BFCBDB',
  inkFaint: '#8C9BB2',
  sunk: '#1E2A40',
  lineSoft: '#222F44',
  brass: '#2563EB',
  brassDeep: '#1D4ED8',
};

// ── Inline ──────────────────────────────────────────────────

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(<Text key={`${keyBase}-t${last}`}>{text.slice(last, m.index)}</Text>);
    const token = m[0];
    const key = `${keyBase}-${m.index}`;

    if (token.startsWith('`')) {
      out.push(
        <Text key={key} style={ms.inlineCode}>{token.slice(1, -1)}</Text>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push(<Text key={key} style={ms.bold}>{token.slice(2, -2)}</Text>);
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      out.push(
        <Text key={key} style={ms.link} onPress={() => Linking.openURL(href)}>{label}</Text>,
      );
    } else {
      out.push(<Text key={key} style={ms.italic}>{token.slice(1, -1)}</Text>);
    }
    last = m.index + token.length;
  }

  if (last < text.length) out.push(<Text key={`${keyBase}-t${last}`}>{text.slice(last)}</Text>);
  return out;
}

function InlineText({ text, keyBase }: { text: string; keyBase: string }) {
  return <Text style={ms.paragraph}>{renderInline(text, keyBase)}</Text>;
}

// ── Block patterns ──────────────────────────────────────────

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBER = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^\s*```/;

function cells(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
}

function isDivider(line: string | undefined): boolean {
  return !!line && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

const HEADING_SIZES = [17, 15.5, 14, 13.5, 13, 12.5];

// ── Component ───────────────────────────────────────────────

export function Markdown({ text, style }: { text: string; style?: any }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Fenced code
    if (FENCE.test(line)) {
      const start = ++i;
      while (i < lines.length && !FENCE.test(lines[i])) i++;
      blocks.push(
        <View key={`code${start}`} style={ms.codeBlock}>
          <Text style={ms.codeBlockText}>{lines.slice(start, i).join('\n')}</Text>
        </View>,
      );
      i++;
      continue;
    }

    // Heading
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const size = HEADING_SIZES[level - 1];
      blocks.push(
        <Text key={`h${i}`} style={[ms.heading, { fontSize: size, marginTop: blocks.length === 0 ? 0 : level <= 2 ? 16 : 12 }]}>
          {renderInline(heading[2], `h${i}`)}
        </Text>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (RULE.test(line)) {
      blocks.push(<View key={`hr${i}`} style={ms.hr} />);
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && isDivider(lines[i + 1])) {
      const header = cells(line);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        body.push(cells(lines[i]));
        i++;
      }
      blocks.push(
        <View key={`t${i}`} style={ms.table}>
          <View style={ms.tableHeaderRow}>
            {header.map((h, n) => (
              <View key={n} style={[ms.tableCell, ms.tableHeaderCell, n === 0 && { flex: 1.5 }]}>
                <Text style={ms.tableHeaderText}>{renderInline(h, `th${n}`)}</Text>
              </View>
            ))}
          </View>
          {body.map((row, r) => (
            <View key={r} style={[ms.tableRow, r < body.length - 1 && ms.tableRowBorder]}>
              {header.map((_, c) => (
                <View key={c} style={[ms.tableCell, c === 0 && { flex: 1.5 }]}>
                  <Text style={ms.tableCellText}>{renderInline(row[c] ?? '', `td${r}-${c}`)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>,
      );
      continue;
    }

    // Lists
    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line) && !BULLET.test(line);
      const items: { depth: number; body: string }[] = [];
      while (i < lines.length) {
        const b = BULLET.exec(lines[i]);
        const n = NUMBER.exec(lines[i]);
        if (!b && !n) break;
        if ((ordered && !n && b) || (!ordered && n && !b)) break;
        const indent = (b ? b[1] : n![1]).length;
        items.push({ depth: indent >= 2 ? 1 : 0, body: b ? b[2] : n![3] });
        i++;
      }
      blocks.push(
        <View key={`l${i}`} style={ms.list}>
          {items.map((it, n) => (
            <View key={n} style={[ms.listItem, it.depth > 0 && ms.listItemNested]}>
              <Text style={ms.listBullet}>{ordered ? `${n + 1}.` : '\u2022'}</Text>
              <Text style={ms.listItemText}>{renderInline(it.body, `li${n}`)}</Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    // Blockquote
    if (QUOTE.test(line)) {
      const start = i;
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      blocks.push(
        <View key={`q${start}`} style={ms.blockquote}>
          <Text style={ms.blockquoteText}>{quoted.join(' ')}</Text>
        </View>,
      );
      continue;
    }

    // Paragraph
    const start = i;
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !HEADING.test(lines[i]) && !RULE.test(lines[i]) &&
      !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) &&
      !QUOTE.test(lines[i]) && !FENCE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <Text key={`p${start}`} style={[ms.paragraph, blocks.length > 0 && { marginTop: 10 }]}>
        {para.map((l, n) => (
          <Fragment key={n}>
            {n > 0 && '\n'}
            {renderInline(l, `p${start}-${n}`)}
          </Fragment>
        ))}
      </Text>,
    );
  }

  return <View style={style}>{blocks}</View>;
}

const ms = StyleSheet.create({
  paragraph: {
    fontSize: 14,
    lineHeight: 23,
    color: C.ink,
  },
  bold: {
    fontWeight: '600',
    color: C.ink,
  },
  italic: {
    fontStyle: 'italic',
  },
  inlineCode: {
    backgroundColor: C.sunk,
    color: C.inkSoft,
    fontSize: 13,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  link: {
    color: C.brassDeep,
    textDecorationLine: 'underline',
  },
  heading: {
    fontWeight: '600',
    color: C.ink,
  },
  hr: {
    height: 1,
    backgroundColor: C.lineSoft,
    marginVertical: 14,
  },
  codeBlock: {
    marginTop: 10,
    backgroundColor: C.sunk,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  codeBlockText: {
    fontSize: 12.5,
    color: C.inkSoft,
    fontFamily: 'Menlo',
  },
  table: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.lineSoft,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30,42,64,0.5)',
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  tableCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableHeaderCell: {},
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableCellText: {
    fontSize: 12.5,
    color: C.inkSoft,
  },
  list: {
    marginTop: 8,
    gap: 4,
  },
  listItem: {
    flexDirection: 'row',
    paddingLeft: 8,
  },
  listItemNested: {
    paddingLeft: 28,
  },
  listBullet: {
    fontSize: 14,
    color: C.inkFaint,
    width: 20,
    lineHeight: 23,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 23,
    color: C.ink,
  },
  blockquote: {
    marginTop: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(37,99,235,0.4)',
    paddingLeft: 12,
  },
  blockquoteText: {
    fontSize: 14,
    lineHeight: 23,
    color: C.inkSoft,
  },
});
