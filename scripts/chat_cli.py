#!/usr/bin/env python3
"""터미널에서 챗봇과 대화하기.
- 인자 없이 실행: 대화형 REPL (history 유지, "exit"/"quit"로 종료)
- 인자로 질문 전달: 단발 질문 (python3 scripts/chat_cli.py "질문 내용")
"""
import json
import sys
import urllib.request

API = "http://localhost:9000/api/chat/stream"


def ask(question: str, history: list) -> str:
    body = json.dumps({"message": question, "history": history}).encode()
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    answer = ""
    with urllib.request.urlopen(req, timeout=90) as resp:
        for line in resp:
            line = line.decode("utf-8").strip()
            if not line.startswith("data: "):
                continue
            payload = json.loads(line[6:])
            if payload.get("type") == "token":
                print(payload["text"], end="", flush=True)
                answer += payload["text"]
    print()
    return answer


def repl():
    history = []
    print("Korean Knowledge Assistant — 질문 입력, exit/quit으로 종료\n")
    while True:
        try:
            question = input("나> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not question:
            continue
        if question in ("exit", "quit"):
            break
        print("봇> ", end="")
        answer = ask(question, history)
        history.append({"role": "user", "content": question})
        history.append({"role": "assistant", "content": answer})
        print()


if __name__ == "__main__":
    if len(sys.argv) >= 2:
        ask(sys.argv[1], [])
    else:
        repl()
