#!/usr/bin/env node
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const BACKEND = "http://localhost:9000";

const server = new McpServer({
  name: "korean-standards",
  version: "1.0.0",
});

// 도구 1: 챗봇에 질문하고 RAG 답변 받기
server.tool(
  "ask_korean_standards",
  "표준국어대사전 및 공공데이터 공통표준 DB에 질문합니다. 단어 뜻풀이, 영문약어, 데이터 타입, DB 컬럼 설계, 표준화 절차 등을 질문하세요.",
  { message: z.string().describe("질문 내용") },
  async ({ message }) => {
    const res = await fetch(`${BACKEND}/api/chat/full`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    const sources = data.sources
      ?.map((s) => `[${s.source}] ${s.title}`)
      .join(", ");
    return {
      content: [
        {
          type: "text",
          text: `${data.answer}\n\n참고 출처: ${sources || "없음"}`,
        },
      ],
    };
  }
);

// 도구 2: 공통표준용어 정확 검색
server.tool(
  "get_standard_term",
  "공통표준용어를 정확히 검색합니다. 영문약어(컬럼명), 도메인, 데이터 타입, 설명을 반환합니다.",
  { term_name: z.string().describe("검색할 용어명 (예: 납부금액, 주민등록번호)") },
  async ({ term_name }) => {
    const res = await fetch(
      `${BACKEND}/api/term?name=${encodeURIComponent(term_name)}`
    );
    if (!res.ok) return { content: [{ type: "text", text: "해당 용어를 찾을 수 없습니다." }] };
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 도구 3: 도메인 정보 검색
server.tool(
  "get_domain_info",
  "공통표준도메인 정보를 검색합니다. 데이터 타입, 길이, 저장·표현 형식을 반환합니다.",
  { domain_name: z.string().describe("도메인명 (예: 금액N15, 번호C13)") },
  async ({ domain_name }) => {
    const res = await fetch(
      `${BACKEND}/api/domain?name=${encodeURIComponent(domain_name)}`
    );
    if (!res.ok) return { content: [{ type: "text", text: "해당 도메인을 찾을 수 없습니다." }] };
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 도구 4: 표준국어대사전 단어 검색
server.tool(
  "search_dictionary",
  "표준국어대사전에서 단어의 뜻풀이, 품사, 예문을 검색합니다.",
  { word: z.string().describe("검색할 단어") },
  async ({ word }) => {
    const res = await fetch(
      `${BACKEND}/api/dictionary?word=${encodeURIComponent(word)}`
    );
    if (!res.ok) return { content: [{ type: "text", text: "해당 단어를 찾을 수 없습니다." }] };
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(console.error);
