from dataclasses import asdict

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.ast_analyzer import analyze_file, find_definition

router = APIRouter()


class FileInput(BaseModel):
    path: str
    content: str


class AnalyzeFileRequest(BaseModel):
    path: str
    content: str


@router.post("/file")
async def analyze_single(req: AnalyzeFileRequest) -> dict:
    result = analyze_file(req.path, req.content)
    return asdict(result)


class AnalyzeProjectRequest(BaseModel):
    files: list[FileInput] = Field(..., max_length=2000)


@router.post("/project")
async def analyze_project(req: AnalyzeProjectRequest) -> dict:
    analyses = [asdict(analyze_file(f.path, f.content)) for f in req.files]
    lang_counts: dict[str, int] = {}
    for f in req.files:
        ext = f.path.rsplit(".", 1)[-1].lower() if "." in f.path else "other"
        lang_counts[ext] = lang_counts.get(ext, 0) + 1
    return {
        "fileCount": len(req.files),
        "languageBreakdown": lang_counts,
        "files": analyses,
    }


class FindDefinitionRequest(BaseModel):
    files: list[FileInput]
    symbol: str


@router.post("/find-definition")
async def find_def(req: FindDefinitionRequest) -> dict:
    hits = find_definition([(f.path, f.content) for f in req.files], req.symbol)
    return {"symbol": req.symbol, "matches": hits}
