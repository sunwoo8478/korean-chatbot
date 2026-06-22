# 브랜치 전략 및 기여 가이드

## 브랜치 구조

```
main (또는 master)   ← 배포 브랜치. 직접 push 금지.
  └── develop        ← 개발 통합 브랜치 (있는 경우)
        ├── feature/기능명   ← 새 기능 개발
        ├── fix/버그명       ← 버그 수정
        └── hotfix/긴급수정  ← 긴급 패치
```

## 작업 순서

```bash
# 1. 최신 main 기준으로 브랜치 생성
git checkout main && git pull
git checkout -b feature/작업명

# 2. 작업 + 커밋 (작업 단위마다)
git add 파일
git commit -m "feat: 기능 설명"

# 3. Push 후 PR 생성
git push origin feature/작업명
# GitHub에서 Pull Request 생성 → main으로 merge 요청

# 4. 리뷰 후 merge → 브랜치 삭제
```

## 커밋 메시지 규칙

| 타입 | 설명 |
|------|------|
| `feat:` | 새 기능 추가 |
| `fix:` | 버그 수정 |
| `docs:` | 문서 수정 |
| `style:` | 코드 스타일 (기능 변경 없음) |
| `refactor:` | 리팩토링 |
| `chore:` | 빌드/설정 변경 |
| `perf:` | 성능 개선 |

## PR 규칙

- main/master에 직접 push 금지
- PR 생성 후 최소 1명 리뷰 후 merge
- PR 제목은 커밋 메시지 규칙과 동일
- merge 후 feature 브랜치 삭제
