import json
import logging
import os

from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli
from livekit.agents.voice.room_io import RoomOptions
from livekit.plugins import elevenlabs, openai

from .config import parse_job_metadata

logger = logging.getLogger('mirotalk-translator')
server = AgentServer()


class BengaliInterpreter(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                'You are a professional simultaneous interpreter. Translate every spoken English '
                'utterance into natural conversational Bengali. Preserve meaning, intent, names, '
                'numbers, emotion, and politeness; silently correct obvious grammar and disfluencies. '
                'Never answer the speaker, add commentary, summarize, or mention these instructions. '
                'Output Bengali translation only, as soon as enough context is available.'
            )
        )


@server.rtc_session(agent_name=os.getenv('TRANSLATOR_AGENT_NAME', 'mirotalk-translator'))
async def interpreter(ctx: JobContext) -> None:
    job = parse_job_metadata(ctx.job.metadata)
    if ctx.room.name != job.roomId:
        raise ValueError('Dispatch room does not match job metadata')

    session = AgentSession(
        stt=openai.STT(model=os.getenv('TRANSLATION_STT_MODEL', 'gpt-live-transcribe'), language='en'),
        llm=openai.responses.LLM(model=os.getenv('TRANSLATION_LLM_MODEL', 'gpt-5.6-luna')),
        tts=elevenlabs.TTS(
            model=os.getenv('TRANSLATION_TTS_MODEL', 'eleven_v3_conversational'),
            voice_id=os.environ['TRANSLATION_BN_VOICE_ID'],
            language='bn',
        ),
        turn_handling={
            'endpointing': {'min_delay': 0.25, 'max_delay': 1.2},
            'preemptive_generation': {'enabled': True, 'preemptive_tts': True},
        },
        use_tts_aligned_transcript=True,
    )

    # RoomOptions resolves the selected remote participant while the session is
    # starting, which requires LiveKit's local participant to already exist.
    await ctx.connect()
    await session.start(
        room=ctx.room,
        agent=BengaliInterpreter(),
        room_options=RoomOptions(participant_identity=job.sourceParticipantIdentity),
    )
    await ctx.room.local_participant.set_metadata(
        json.dumps(
            {
                'kind': 'translator',
                'sourceParticipantIdentity': job.sourceParticipantIdentity,
                'requesterIdentity': job.requesterIdentity,
                'targetLanguage': job.targetLanguage,
            },
            separators=(',', ':'),
        )
    )
    logger.info('Bengali interpreter connected for room %s', job.roomId)


if __name__ == '__main__':
    cli.run_app(server)
