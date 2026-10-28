from pathlib import Path
import json, hashlib, sys
R=Path(__file__).parent
records=json.loads((R/'data.json').read_text())
css='\n'.join((R/f).read_text() for f in ['vendor/leaflet/leaflet.css','map.css','ui.css'])
vendor='/*\n'+(R/'vendor/leaflet/LICENSE').read_text()+'\n*/\n'+(R/'vendor/leaflet/leaflet.js').read_text()
js=vendor+'\n;\n'+'\n'.join((R/f).read_text() for f in ['engine.js','map.js','ui.js'])
maphtml=(R/'map-fragment.html').read_text()
html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="theme-color" content="#101113"><meta name="description" content="2026년 11월 28–30일 순천·여수 자차 여행. 베네치아 2박 확정 코스에 식당·카페를 선택하면 지도 동선과 도착 시각을 계산합니다."><title>여수-순천 여행</title><style>__CSS__</style></head><body>
<header class="header" id="appHeader"><button class="brand" id="brand" aria-label="부산·순천·여수 전체 지도">여수-순천 여행</button><nav class="view-switch" aria-label="보기 선택"><button id="pane-split" data-pane="split" aria-pressed="true">전체</button><button id="pane-map" data-pane="map" aria-pressed="false">지도</button><button id="pane-places" data-pane="places" aria-pressed="false">추천</button><button id="pane-schedule" data-pane="schedule" aria-pressed="false">일정</button></nav><span class="dates">11.28 — 11.30 · 자차 · 여수 2박</span><button class="help" data-action="info" aria-label="사용 안내">?</button></header>
<main class="main" id="main" data-pane="split" data-layout="columns"><section class="map-frame" aria-label="여행 지도"><div class="map-toolbar"><div id="mapDays" aria-label="지도 날짜"></div><div class="top-buttons"><button id="homeBtn">부산 포함</button><button id="fitBtn">전체 후보</button></div></div>__MAP__<div class="map-play-controls" id="mapPlayback"><button id="mapPlay" data-action="play">▶ 일정 시작</button><button id="arrivalReplay" data-action="arrival">부산부터 보기</button><button id="skipArrival" data-action="skip-arrival" hidden>여행지 보기</button></div><div class="map-help" id="mapHelp"></div><div class="play-caption" id="playCaption" hidden></div></section><div class="pane-divider" id="mapDivider" data-resize-pane="0" role="separator" tabindex="0" aria-label="지도와 추천 사이 크기 조절" aria-orientation="vertical" aria-valuenow="50" title="끌어서 조절 · 두 번 누르면 50:25:25"><span></span></div><section class="candidate-panel" id="candidatePanel" aria-label="추천 장소"></section><div class="pane-divider" id="planDivider" data-resize-pane="1" role="separator" tabindex="0" aria-label="추천과 일정 사이 크기 조절" aria-orientation="vertical" aria-valuenow="75" title="끌어서 조절 · 두 번 누르면 50:25:25"><span></span></div><section class="planner" id="planner" aria-label="확정 코스 시간표"></section></main>
<dialog class="dialog" id="detail" aria-labelledby="detailTitle"><header class="dialog-head"><h2 id="detailTitle"></h2><button id="closeDetail" aria-label="장소 정보 닫기">×</button></header><div class="dialog-body" id="detailBody"></div></dialog><dialog class="dialog" id="dialog" aria-labelledby="dialogTitle"><header class="dialog-head"><h2 id="dialogTitle"></h2><button id="closeDialog" aria-label="안내 창 닫기">×</button></header><div class="dialog-body" id="dialogBody"></div></dialog><div id="toast" class="toast" role="status" hidden></div><script type="application/json" id="travelData">__DATA__</script><script>__JS__</script></body></html>'''
build_id=hashlib.sha256((css+js+maphtml+json.dumps(records,ensure_ascii=False)).encode()).hexdigest()[:16]
html=html.replace('<title>','<meta name="app-build" content="'+build_id+'"><title>')
html=html.replace('__CSS__',css).replace('__MAP__',maphtml).replace('__DATA__',json.dumps(records,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')).replace('__JS__',js)
(R/'yeosu-suncheon.html').write_text(html)
(R/'dist').mkdir(exist_ok=True)
(R/'dist/index.html').write_text(html)
(R/'dist/.nojekyll').touch()
qa = R/'dist/qa.html'
if '--qa' in sys.argv:
    qa.write_text((R/'test-browser.html').read_text())
elif qa.exists():
    qa.unlink()
print('Built',build_id,len(html.encode()),'bytes;',len(records[0]['points']),'points; one fixed itinerary')
