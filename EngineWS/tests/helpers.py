from unittest.mock import AsyncMock, MagicMock
from websockets.protocol import State


class FakeWebSocket:
    def __init__(self, message_generator=None):
        self.state = State.OPEN
        self.sent_messages = []
        self.close = AsyncMock(side_effect=self._mark_closed)
        self._message_generator = message_generator

    async def _mark_closed(self, code=1000, reason=""):
        self.state = State.CLOSED

    async def send(self, message):
        self.sent_messages.append(message)

    def __aiter__(self):
        if self._message_generator is None:
            async def empty_stream():
                return
                yield
            return empty_stream()
        return self._message_generator()


def make_engine_mock(stdout_lines=None):
    mock_engine = MagicMock()
    mock_engine.start = AsyncMock(return_value=mock_engine)
    mock_engine.send_uci = AsyncMock()
    mock_engine.wait_until_closed = AsyncMock()
    if stdout_lines is not None:
        mock_engine.read_stdout_line = AsyncMock(side_effect=stdout_lines)
    mock_engine.stderr = None
    mock_engine.has_sent_quit = False
    mock_engine.exit_code = None
    return mock_engine
