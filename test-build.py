from html.parser import HTMLParser
from pathlib import Path
import json, re, subprocess

root = Path(__file__).parent
html = (root / 'dist/index.html').read_text()

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.remote_scripts = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'script' and attrs.get('src'):
            self.remote_scripts.append(attrs['src'])

page = Page()
page.feed(html)
assert len(page.ids) == len(set(page.ids)), 'duplicate static DOM ids'
assert not page.remote_scripts, 'build must work without third-party JavaScript'
assert '<title>여수-순천 여행</title>' in html
assert all(token not in html for token in ['__CSS__', '__DATA__', '__JS__', '__MAP__'])
data = re.search(r'<script type="application/json" id="travelData">(.*?)</script>', html, re.S)[1]
records = json.loads(data)
assert len(records) == 1 and len(records[0]['points']) == 65
assert 'courses' not in records[0]
assert all(key not in html for key in ['data-course=', 'data-time-part=', 'timelineGhost'])
assert all(key in html for key in ['data-slot=', 'data-clear-slot=', 'data-route-from=', 'data-route-to='])
assert 'viewport-fit=cover' in html and 'prefers-reduced-motion' in html
assert (root / 'dist/.nojekyll').exists()
assert (root / 'yeosu-suncheon.html').read_bytes() == (root / 'dist/index.html').read_bytes()
for filename in ['ui.js', 'engine.js', 'map.js']:
    subprocess.run(['node', '--check', str(root / filename)], check=True)
print('Standalone build, embedded data, DOM identifiers and JavaScript syntax verified.')
