# python_backend/main.py: gRPC server entry point.
import asyncio
import logging
import os
import sys
from pathlib import Path

import grpc

# grpc_tools generates absolute imports, so add the output dir to sys.path.
sys.path.insert(0, str(Path(__file__).parent / "generated"))
import spellcheck_pb2 as pb  # noqa: E402
import spellcheck_pb2_grpc as pb_grpc  # noqa: E402

from ai_service import AIEngine  # noqa: E402

ADDRESS = os.environ.get("PYTHON_BACKEND_BIND", "127.0.0.1:50051")  # loopback only


class SpellcheckerServicer(pb_grpc.SpellcheckerServicer):
    def __init__(self, engine: AIEngine):
        self.engine = engine

    async def Check(self, request, context):
        spans = [(s.start, s.end, s.word) for s in request.suspect_spans]
        try:
            # Inference is blocking, so keep it off the event loop.
            results = await asyncio.to_thread(
                self.engine.suggest, request.text, spans, request.language or "en"
            )
        except Exception as exc:  # noqa: BLE001
            logging.exception("inference failed")
            await context.abort(grpc.StatusCode.INTERNAL, str(exc))

        return pb.SpellcheckResponse(
            request_id=request.request_id,
            model=self.engine.name,
            suggestions=[
                pb.Suggestion(
                    start=r.start, end=r.end, original=r.original,
                    candidates=r.candidates, confidence=r.confidence,
                    explanation=r.explanation,
                )
                for r in results
            ],
        )


async def serve() -> None:
    engine = AIEngine.from_env()
    engine.load()  # load weights BEFORE accepting traffic

    server = grpc.aio.server()
    pb_grpc.add_SpellcheckerServicer_to_server(SpellcheckerServicer(engine), server)
    server.add_insecure_port(ADDRESS)
    await server.start()
    logging.info("Python backend listening on %s (engine=%s)", ADDRESS, engine.name)
    await server.wait_for_termination()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(serve())