#!/usr/bin/env python3
"""AI Route Test Script — Interactive category/question selection with 50+ questions.
AI 라우트 테스트 스크립트 — 카테고리/질문 선택 + 50개 이상 질문.

Usage / 사용법:
  python3 scripts/test-ai-routes.py                    # Interactive menu / 대화형 메뉴
  python3 scripts/test-ai-routes.py --all              # Run all questions / 전체 실행
  python3 scripts/test-ai-routes.py --cat security     # Run one category / 카테고리 지정
  python3 scripts/test-ai-routes.py --cat cost,infra   # Run multiple categories / 복수 카테고리
  python3 scripts/test-ai-routes.py --quick            # 1 question per category / 카테고리별 1개
  python3 scripts/test-ai-routes.py --url http://host:3000/awsops/api/ai
  python3 scripts/test-ai-routes.py --timeout 120
"""
import json, time, urllib.request, sys, os
from datetime import datetime
from collections import OrderedDict

# -- Configuration / 설정 --------------------------------------------------
URL = "http://localhost:3000/awsops/api/ai"
TIMEOUT = 90

# Parse CLI args / CLI 인자 파싱
for i, arg in enumerate(sys.argv):
    if arg == "--url" and i + 1 < len(sys.argv):
        URL = sys.argv[i + 1]
    if arg == "--timeout" and i + 1 < len(sys.argv):
        TIMEOUT = int(sys.argv[i + 1])

# -- Question Bank / 질문 은행 (9 categories, 50+ questions) ----------------
# Format: { category: [(expected_route, label, question), ...] }
QUESTION_BANK = OrderedDict([

    ("security", [
        ("security", "보안 요약",           "보안 이슈가 있는지 확인해줘"),
        ("security", "IAM 사용자",          "IAM 사용자 목록과 Access Key 상태를 보여줘"),
        ("security", "역할 분석",           "AWSopsAgentCoreRole의 권한을 분석해줘"),
        ("security", "그룹 목록",           "IAM 그룹 목록을 보여줘"),
        ("security", "정책 목록",           "현재 계정의 커스텀 IAM 정책을 조회해줘"),
        ("security", "권한 시뮬레이션",      "EC2 역할이 S3에 접근할 수 있는지 테스트해줘"),
        ("security", "미사용 자격 증명",     "90일 이상 사용하지 않은 Access Key가 있는지 확인해줘"),
    ]),

    ("infra", [
        ("infra", "VPC 현황",              "VPC 현황과 서브넷 구성을 알려줘"),
        ("infra", "EKS 클러스터",           "EKS 클러스터 상태와 노드 현황을 확인해줘"),
        ("infra", "보안그룹",               "보안그룹 규칙을 확인해줘"),
        ("infra", "TGW 현황",              "Transit Gateway 현황과 라우팅을 알려줘"),
        ("infra", "VPN 연결",              "VPN 연결 상태를 확인해줘"),
        ("infra", "ECS 서비스",             "ECS 클러스터와 서비스 현황을 보여줘"),
        ("infra", "ENI 조회",              "10.0.0.1 IP를 사용하는 ENI를 찾아줘"),
        ("infra", "네트워크 토폴로지",       "전체 네트워크 구성을 설명해줘"),
        ("infra", "EKS 로그",              "EKS 클러스터의 CloudWatch 로그를 확인해줘"),
    ]),

    ("cost", [
        ("cost", "비용 분석",              "이번 달 비용을 서비스별로 분석해줘"),
        ("cost", "비용 비교",              "전월 대비 비용 변화와 증가 원인을 알려줘"),
        ("cost", "비용 예측",              "다음 달 비용을 예측해줘"),
        ("cost", "비용 동인",              "비용이 가장 많이 증가한 서비스가 뭐야?"),
        ("cost", "예산 확인",              "현재 예산 상태를 확인해줘"),
        ("cost", "EC2 비용",              "EC2 인스턴스 타입별 비용을 분석해줘"),
    ]),

    ("monitoring", [
        ("monitoring", "알람 확인",         "현재 활성화된 CloudWatch 알람이 있어?"),
        ("monitoring", "CPU 추세",          "EC2 인스턴스 CPU 사용량 추세를 보여줘"),
        ("monitoring", "CloudTrail",       "최근 CloudTrail 이벤트를 조회해줘"),
        ("monitoring", "로그 그룹",         "CloudWatch 로그 그룹 목록을 보여줘"),
        ("monitoring", "알람 추천",         "EC2 CPU에 대한 알람 임계값을 추천해줘"),
        ("monitoring", "API 감사",          "최근 1시간 동안 누가 어떤 API를 호출했는지 알려줘"),
        ("monitoring", "로그 분석",         "Lambda 함수의 에러 로그를 분석해줘"),
    ]),

    ("data", [
        ("data", "DynamoDB",              "DynamoDB 테이블 목록을 보여줘"),
        ("data", "RDS",                   "RDS 인스턴스 현황과 상태를 확인해줘"),
        ("data", "ElastiCache",           "ElastiCache 클러스터 구성을 알려줘"),
        ("data", "MSK Kafka",             "MSK Kafka 클러스터 정보를 보여줘"),
        ("data", "RDS 스냅샷",             "RDS 스냅샷 목록을 확인해줘"),
        ("data", "DynamoDB 모델링",        "DynamoDB 데이터 모델링 가이드를 알려줘"),
        ("data", "캐시 모범사례",           "ElastiCache 모범사례를 알려줘"),
    ]),

    ("aws-data", [
        ("aws-data", "EC2 목록",           "EC2 인스턴스 목록을 보여줘"),
        ("aws-data", "S3 버킷",            "S3 버킷 현황을 정리해줘"),
        ("aws-data", "Lambda 함수",        "Lambda 함수 목록과 런타임을 알려줘"),
        ("aws-data", "리소스 요약",         "전체 AWS 리소스 개수를 요약해줘"),
        ("aws-data", "VPC 보안그룹 수",     "VPC별 보안그룹 개수를 알려줘"),
        ("aws-data", "ALB 목록",           "Application Load Balancer 목록을 보여줘"),
    ]),

    ("iac", [
        ("iac", "CDK 모범사례",            "CDK 모범사례를 알려줘"),
        ("iac", "Terraform 모듈",          "Terraform VPC 모듈을 검색해줘"),
        ("iac", "CF 문서",                 "CloudFormation Lambda 리소스 문서를 찾아줘"),
        ("iac", "CDK 예제",               "CDK로 S3 버킷 만드는 예제를 보여줘"),
    ]),

    ("code", [
        ("code", "피보나치",               "피보나치 수열 처음 20개를 파이썬으로 계산해줘"),
        ("code", "정렬 알고리즘",           "버블 정렬과 퀵 정렬의 성능을 비교하는 코드를 실행해줘"),
        ("code", "차트 생성",              "1부터 100까지 소수를 구하고 분포를 보여주는 코드를 만들어줘"),
    ]),

    ("general", [
        ("general", "리전 가용성",          "서울 리전에서 Bedrock이 사용 가능한지 확인해줘"),
        ("general", "AWS 문서 검색",        "Lambda 동시성 제한에 대한 문서를 찾아줘"),
        ("general", "서비스 추천",          "실시간 스트리밍 처리에 적합한 AWS 서비스를 추천해줘"),
    ]),

])

CATEGORIES = list(QUESTION_BANK.keys())
TOTAL_QUESTIONS = sum(len(qs) for qs in QUESTION_BANK.values())


# -- API call / API 호출 ---------------------------------------------------
def call_ai(question):
    """Call AI API and return result dict. / AI API 호출 후 결과 딕셔너리 반환."""
    payload = json.dumps({"messages": [{"role": "user", "content": question}]}).encode()
    req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json"})
    start = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=TIMEOUT)
        elapsed = time.time() - start
        data = json.loads(resp.read())
        return {
            "time": elapsed,
            "route": data.get("route", "?"),
            "via": data.get("via", "?"),
            "content_length": len(data.get("content", "")),
            "content_preview": data.get("content", "")[:200].replace("\n", " "),
            "error": None,
        }
    except Exception as e:
        return {
            "time": time.time() - start,
            "route": "?",
            "via": "?",
            "content_length": 0,
            "content_preview": "",
            "error": str(e)[:100],
        }


# -- Interactive menu / 대화형 메뉴 -----------------------------------------
def show_menu():
    """Show interactive category and question selection menu. / 대화형 선택 메뉴 표시."""
    print(f"\n{'='*70}")
    print(f"  AWSops AI Route Test — Interactive Mode")
    print(f"  URL: {URL}  |  Timeout: {TIMEOUT}s")
    print(f"{'='*70}\n")
    print("  카테고리 선택 / Select category:\n")
    print(f"   {'#':<4} {'Category':<14} {'Questions':>9}  Description")
    print(f"   {'-'*60}")
    print(f"   {'0':<4} {'ALL':<14} {TOTAL_QUESTIONS:>9}  전체 실행 / Run all")
    print(f"   {'Q':<4} {'QUICK':<14} {len(CATEGORIES):>9}  카테고리별 1개 / 1 per category")
    print()

    cat_descriptions = {
        "security":   "IAM 보안 점검, 사용자/역할/정책 분석",
        "infra":      "VPC, EKS, ECS, TGW, 네트워크 진단",
        "cost":       "비용 분석, 비교, 예측, FinOps",
        "monitoring": "CloudWatch 알람/메트릭, CloudTrail 감사",
        "data":       "DynamoDB, RDS, ElastiCache, MSK",
        "aws-data":   "Steampipe SQL로 리소스 조회",
        "iac":        "CDK, Terraform, CloudFormation",
        "code":       "Python 코드 실행 (Code Interpreter)",
        "general":    "AWS 문서, 리전 가용성, 추천",
    }

    for i, cat in enumerate(CATEGORIES, 1):
        qs = QUESTION_BANK[cat]
        desc = cat_descriptions.get(cat, "")
        print(f"   {i:<4} {cat:<14} {len(qs):>9}  {desc}")

    print()
    choice = input("  선택 (번호/이름, 쉼표 구분 가능) / Choice: ").strip()

    if not choice:
        return None
    if choice.upper() == "Q":
        return "quick"
    if choice == "0":
        return "all"

    # Parse selection / 선택 파싱
    selected = []
    for part in choice.split(","):
        part = part.strip()
        if part.isdigit():
            idx = int(part)
            if 1 <= idx <= len(CATEGORIES):
                selected.append(CATEGORIES[idx - 1])
        elif part in CATEGORIES:
            selected.append(part)

    if not selected:
        print("  잘못된 입력 / Invalid input")
        return None

    return selected


def select_questions(category):
    """Show questions in a category and let user select. / 카테고리 내 질문 선택."""
    questions = QUESTION_BANK[category]
    print(f"\n  [{category.upper()}] 질문 선택 / Select questions:\n")
    print(f"   {'#':<4} {'Label':<18} Question")
    print(f"   {'-'*60}")
    print(f"   {'0':<4} {'ALL':<18} 전체 실행 / Run all ({len(questions)})")

    for i, (_, label, question) in enumerate(questions, 1):
        print(f"   {i:<4} {label:<18} {question[:50]}")

    print()
    choice = input(f"  선택 (번호, 쉼표 구분, 0=전체) [{category}]: ").strip()

    if not choice or choice == "0":
        return questions

    selected = []
    for part in choice.split(","):
        part = part.strip()
        if part.isdigit():
            idx = int(part)
            if 1 <= idx <= len(questions):
                selected.append(questions[idx - 1])

    return selected if selected else questions


# -- Run tests / 테스트 실행 ------------------------------------------------
def run_tests(test_list):
    """Run selected tests and print results. / 선택된 테스트 실행 및 결과 출력."""
    print(f"\n{'='*90}")
    print(f"  AWSops AI Route Test — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  URL: {URL}  |  Timeout: {TIMEOUT}s  |  Questions: {len(test_list)}")
    print(f"{'='*90}\n")

    results = []
    pass_count = 0
    fail_count = 0
    route_match = 0
    total_time = 0

    for i, (expected_route, label, question) in enumerate(test_list, 1):
        print(f"  [{i:2d}/{len(test_list)}] {label:<18} {question[:38]:<38} ", end="", flush=True)
        result = call_ai(question)
        result["label"] = label
        result["question"] = question
        result["expected_route"] = expected_route

        elapsed = result["time"]
        total_time += elapsed

        if result["error"]:
            fail_count += 1
            result["status"] = "FAIL"
            print(f" {elapsed:>5.1f}s  ❌ {result['error'][:45]}")
        else:
            pass_count += 1
            matched = result["route"] == expected_route
            if matched:
                route_match += 1
            match_icon = "✓" if matched else "✗"
            result["status"] = "OK"
            print(f" {elapsed:>5.1f}s  ✅ route={result['route']:<11} {match_icon} {result['via'][:35]}")

        results.append(result)

    # Summary / 요약
    total = len(test_list)
    avg_time = total_time / total if total else 0
    ok_times = [r["time"] for r in results if not r["error"]]
    min_time = min(ok_times) if ok_times else 0
    max_time = max(ok_times) if ok_times else 0

    print(f"\n{'='*90}")
    print(f"  SUMMARY / 요약")
    print(f"{'='*90}")
    print(f"  Total:        {pass_count} passed / {fail_count} failed / {total} total")
    print(f"  Route match:  {route_match}/{total} ({route_match/total*100:.0f}%)" if total else "")
    print(f"  Avg time:     {avg_time:.1f}s")
    print(f"  Min / Max:    {min_time:.1f}s / {max_time:.1f}s")
    print(f"  Total time:   {total_time:.1f}s")
    print()

    # Per-route stats / 라우트별 통계
    route_stats = {}
    for r in results:
        key = r["route"] if not r["error"] else "error"
        if key not in route_stats:
            route_stats[key] = {"count": 0, "total_time": 0, "errors": 0, "match": 0}
        route_stats[key]["count"] += 1
        route_stats[key]["total_time"] += r["time"]
        if r["error"]:
            route_stats[key]["errors"] += 1
        elif r["route"] == r["expected_route"]:
            route_stats[key]["match"] += 1

    print(f"  {'Route':<14} {'Count':>5} {'Avg':>8} {'Match':>7} {'Errors':>7}")
    print(f"  {'-'*45}")
    for route, s in sorted(route_stats.items()):
        avg = s["total_time"] / s["count"]
        err = str(s["errors"]) if s["errors"] else "-"
        print(f"  {route:<14} {s['count']:>5} {avg:>7.1f}s {s['match']:>7} {err:>7}")

    # Save JSON report / JSON 리포트 저장
    output_file = f"/tmp/ai-test-results-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    report = {
        "timestamp": datetime.now().isoformat(),
        "url": URL, "timeout": TIMEOUT,
        "summary": {
            "passed": pass_count, "failed": fail_count, "total": total,
            "route_match": route_match,
            "avg_time_sec": round(avg_time, 2),
            "min_time_sec": round(min_time, 2),
            "max_time_sec": round(max_time, 2),
            "total_time_sec": round(total_time, 2),
        },
        "results": results,
    }
    with open(output_file, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\n  Results saved: {output_file}\n")

    return results


# -- Main / 메인 -----------------------------------------------------------
def main():
    # CLI modes / CLI 모드
    if "--all" in sys.argv:
        all_tests = [q for qs in QUESTION_BANK.values() for q in qs]
        run_tests(all_tests)
        return

    if "--quick" in sys.argv:
        quick = [qs[0] for qs in QUESTION_BANK.values()]
        run_tests(quick)
        return

    if "--cat" in sys.argv:
        idx = sys.argv.index("--cat")
        if idx + 1 < len(sys.argv):
            cats = [c.strip() for c in sys.argv[idx + 1].split(",")]
            tests = []
            for c in cats:
                if c in QUESTION_BANK:
                    tests.extend(QUESTION_BANK[c])
                else:
                    print(f"  Unknown category: {c}")
                    print(f"  Available: {', '.join(CATEGORIES)}")
                    return
            run_tests(tests)
            return

    # Interactive mode / 대화형 모드
    selection = show_menu()

    if selection is None:
        return
    elif selection == "all":
        all_tests = [q for qs in QUESTION_BANK.values() for q in qs]
        run_tests(all_tests)
    elif selection == "quick":
        quick = [qs[0] for qs in QUESTION_BANK.values()]
        run_tests(quick)
    elif isinstance(selection, list):
        if len(selection) == 1:
            # Single category: allow question selection / 단일 카테고리: 질문 선택
            tests = select_questions(selection[0])
            run_tests(tests)
        else:
            # Multiple categories: run all in each / 복수 카테고리: 각각 전체 실행
            tests = []
            for cat in selection:
                tests.extend(QUESTION_BANK[cat])
            run_tests(tests)


if __name__ == "__main__":
    main()
