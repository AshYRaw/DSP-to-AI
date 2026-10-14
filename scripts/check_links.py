#!/usr/bin/env python3
"""Link checker for the DSP -> AI static site (stdlib only).

Checks every HTML file under the repo root for:
  1. internal href/src targets that resolve to existing files,
  2. #anchors that exist as id="" on the target page,
  3. an unbroken chapter prev/next chain 01..27, as defined by the
     SITE_MAP in js/core/navigation.js (prev/next links are generated
     from it at runtime), with each chapter file carrying the matching
     data-chapter-id.
Exits non-zero on any failure.
"""
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
SKIP_DIRS = {'.git', 'node_modules', 'scripts'}
# Standalone infographics/gallery posters are not part of the navigable site,
# but they are still checked for broken links.


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []  # (attr_value, line)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.add(a['id'])
        if a.get('name') and tag == 'a':
            self.ids.add(a['name'])
        for key in ('href', 'src'):
            if tag in ('a', 'link', 'script', 'img', 'source', 'iframe') and a.get(key):
                self.links.append((a[key], self.getpos()[0]))


def html_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn.endswith('.html'):
                yield os.path.join(dirpath, fn)


def parse(path):
    p = Page()
    with open(path, encoding='utf-8') as fh:
        p.feed(fh.read())
    return p


def main():
    errors = []
    pages = {}
    for path in html_files():
        pages[path] = parse(path)

    # --- 1 & 2: internal links and anchors ---
    for path, page in pages.items():
        rel = os.path.relpath(path, ROOT)
        for raw, line in page.links:
            u = urlsplit(raw)
            if u.scheme or raw.startswith('//') or raw.startswith('mailto:') or raw.startswith('data:'):
                continue
            target_path = path if not u.path else os.path.normpath(
                os.path.join(os.path.dirname(path), unquote(u.path)))
            if u.path and not os.path.exists(target_path):
                errors.append(f'{rel}:{line}: missing file -> {raw}')
                continue
            if u.fragment:
                if target_path.endswith('.html'):
                    tp = pages.get(target_path) or parse(target_path)
                    if u.fragment not in tp.ids:
                        errors.append(f'{rel}:{line}: missing anchor #{u.fragment} in '
                                      f'{os.path.relpath(target_path, ROOT)}')

    # --- 3: chapter chain from SITE_MAP ---
    nav = open(os.path.join(ROOT, 'js', 'core', 'navigation.js'), encoding='utf-8').read()
    entries = re.findall(r"id:\s*'(ch\d+)',\s*num:\s*'(\d+)',\s*title:\s*'[^']*',\s*file:\s*'([^']+)'", nav)
    if not entries:
        errors.append('navigation.js: could not parse SITE_MAP chapters')
    expected = [f'{i:02d}' for i in range(1, 28)]
    got = [num for _, num, _ in entries]
    if got != expected:
        errors.append(f'navigation.js: chapter chain is {got}, expected 01..27 in order')
    for cid, num, f in entries:
        fp = os.path.join(ROOT, f)
        if not os.path.exists(fp):
            errors.append(f'navigation.js: chapter {num} file missing -> {f}')
            continue
        src = open(fp, encoding='utf-8').read()
        if f'data-chapter-id="{cid}"' not in src:
            errors.append(f'{f}: missing data-chapter-id="{cid}" (prev/next will not render)')
        if 'class="chapter-nav"' not in src:
            errors.append(f'{f}: missing <nav class="chapter-nav"> container')
    on_disk = sorted(os.path.relpath(p, ROOT) for p in pages if '/chapters/' in p)
    listed = sorted(f for _, _, f in entries)
    for extra in set(on_disk) - set(listed):
        errors.append(f'{extra}: chapter file not listed in navigation.js SITE_MAP')

    print(f'checked {len(pages)} HTML files, {sum(len(p.links) for p in pages.values())} links, '
          f'{len(entries)} chapters in chain')
    if errors:
        print('\n'.join(errors))
        print(f'\nFAIL: {len(errors)} problem(s)')
        return 1
    print('OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
