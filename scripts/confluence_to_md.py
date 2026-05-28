#!/usr/bin/env python3
"""Convert Confluence HTML to Obsidian markdown and write files."""
import re, html, os, sys, json

def html_to_md(h):
    if not h or not h.strip():
        return '*No content.*'
    # Remove style/script
    h = re.sub(r'<style[^>]*>.*?</style>', '', h, flags=re.DOTALL)
    h = re.sub(r'<script[^>]*>.*?</script>', '', h, flags=re.DOTALL)
    # Headers
    for i in range(6, 0, -1):
        pattern = r'<h%d[^>]*>(.*?)</h%d>' % (i, i)
        prefix = '#' * i + ' '
        h = re.sub(pattern, lambda m, p=prefix: p + re.sub(r'<[^>]+>', '', m.group(1)) + '\n\n', h, flags=re.DOTALL)
    # Bold/italic
    h = re.sub(r'<strong[^>]*>(.*?)</strong>', r'**\1**', h, flags=re.DOTALL)
    h = re.sub(r'<b[^>]*>(.*?)</b>', r'**\1**', h, flags=re.DOTALL)
    h = re.sub(r'<em[^>]*>(.*?)</em>', r'*\1*', h, flags=re.DOTALL)
    h = re.sub(r'<i[^>]*>(.*?)</i>', r'*\1*', h, flags=re.DOTALL)
    # Code blocks
    h = re.sub(r'<pre[^>]*>(.*?)</pre>', lambda m: '\n```\n' + re.sub(r'<[^>]+>', '', m.group(1)) + '\n```\n', h, flags=re.DOTALL)
    h = re.sub(r'<code[^>]*>(.*?)</code>', lambda m: '`' + re.sub(r'<[^>]+>', '', m.group(1)) + '`', h, flags=re.DOTALL)
    # Tables - convert to markdown
    def convert_table(m):
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', m.group(0), re.DOTALL)
        result = []
        for i, row in enumerate(rows):
            cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.DOTALL)
            cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
            cells = [html.unescape(c) for c in cells]
            if not any(c.strip() for c in cells):
                continue
            result.append('| ' + ' | '.join(cells) + ' |')
            if i == 0:
                result.append('|' + '---|' * len(cells))
        return '\n'.join(result) + '\n\n' if result else ''
    h = re.sub(r'<table[^>]*>.*?</table>', convert_table, h, flags=re.DOTALL)
    # Lists
    h = re.sub(r'<li[^>]*>(.*?)</li>', r'- \1\n', h, flags=re.DOTALL)
    h = re.sub(r'<[ou]l[^>]*>', '', h)
    h = re.sub(r'</[ou]l>', '\n', h)
    # Paragraphs/breaks
    h = re.sub(r'<br\s*/?>', '\n', h)
    h = re.sub(r'<p[^>]*>(.*?)</p>', r'\1\n\n', h, flags=re.DOTALL)
    h = re.sub(r'<hr[^>]*/>', '\n---\n', h)
    h = re.sub(r'<hr[^>]*>', '\n---\n', h)
    # Links
    h = re.sub(r'<a[^>]+href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', r'[\2](\1)', h, flags=re.DOTALL)
    # Images - just note them
    h = re.sub(r'<img[^>]*/>', '[image]', h)
    h = re.sub(r'<img[^>]*>', '[image]', h)
    # Strip remaining tags
    h = re.sub(r'<[^>]+>', '', h)
    # Decode entities
    h = html.unescape(h)
    # Clean up whitespace
    h = re.sub(r'\n{3,}', '\n\n', h)
    h = h.strip()
    return h if h else '*No content.*'

def sanitize_filename(title):
    title = title.replace('/', '-')
    for ch in [':', '*', '?', '"', '<', '>', '|', '\\']:
        title = title.replace(ch, '')
    return title.strip()

def get_date(page):
    dt = page.get('version', {}).get('createdAt', '')
    if dt:
        return dt[:10]
    return '2026-05-26'

def make_frontmatter(page, space, tags):
    date = get_date(page)
    title = page['title']
    pid = page['id']
    tag_str = '[' + ', '.join(tags) + ']'
    return f"""---
date: {date}
source: confluence
space: {space}
confluence_id: "{pid}"
confluence_title: "{title}"
status: synced
tags: {tag_str}
---

"""

def write_page(page, filepath, space, tags):
    body = page.get('body', {}).get('value', '')
    md_body = html_to_md(body)
    title = page['title']
    fm = make_frontmatter(page, space, tags)
    content = fm + f'# {title}\n\n' + md_body + '\n'
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    return filepath

if __name__ == '__main__':
    # Read JSON from stdin: {"pages": [...], "base_dir": "...", "space": "INF", "tags": [...]}
    data = json.load(sys.stdin)
    pages = data['pages']
    base_dir = data['base_dir']
    space = data['space']
    tags = data['tags']
    subdir = data.get('subdir', '')

    written = []
    failed = []
    for page in pages:
        try:
            title = page['title']
            fname = sanitize_filename(title) + '.md'
            if subdir:
                filepath = os.path.join(base_dir, subdir, fname)
            else:
                filepath = os.path.join(base_dir, fname)
            write_page(page, filepath, space, tags)
            written.append(title)
        except Exception as e:
            failed.append({'title': page.get('title', '?'), 'error': str(e)})

    print(json.dumps({'written': len(written), 'failed': failed}))
