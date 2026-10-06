# 카드뉴스 편집기

카드뉴스(스타일 A 클린 라이트 / 스타일 B AKLABS 캐릭터)를 브라우저에서 편집하고 PNG·zip으로 저장하는 도구입니다. 빌드 없이 정적 파일만으로 동작합니다.

- 카드 위에서 직접 이동·크기·회전, 더블클릭으로 글자 편집
- `폴더 열기` / `폴더에 저장`: deck.json이 있는 폴더를 열어 편집하고 deck.json·out/ PNG를 덮어쓰기 (Chrome·Edge)
- 작업 내용은 브라우저(localStorage)에만 저장되며 서버로 전송되지 않습니다
- PNG/zip 저장에는 인터넷(cdnjs 라이브러리)이 필요합니다

로컬 실행: `python3 -m http.server 8941` 후 http://localhost:8941
