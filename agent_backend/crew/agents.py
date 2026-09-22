from crewai import Agent
from langchain_openai import ChatOpenAI
from db.config import settings
from .tools import fetch_platform_stats

def _get_llm():
    return ChatOpenAI(
        model=settings.OPENROUTER_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base=settings.OPENROUTER_BASE_URL,
        temperature=0.7,
        max_tokens=2048,
    )

def create_data_analyst():
    return Agent(
        role='Senior Data Analyst',
        goal='Accurately extract and summarize platform statistics and campaign growth metrics from the database.',
        backstory='You are a meticulous data analyst specializing in web3 crowdfunding. You uncover hidden trends in contribution data.',
        verbose=True,
        allow_delegation=False,
        llm=_get_llm(),
        tools=[fetch_platform_stats]
    )

def create_strategist():
    return Agent(
        role='Platform Strategy Consultant',
        goal='Analyze campaign performance and suggest actionable strategies to boost overall platform growth.',
        backstory='A veteran web3 marketer. You excel at reading raw data and translating it into high-impact growth initiatives.',
        verbose=True,
        allow_delegation=False,
        llm=_get_llm()
    )

def create_reporting_admin():
    return Agent(
        role='Executive Reporting Admin',
        goal='Compile all analytical data and strategic insights into a clean, professional markdown report for the platform owners.',
        backstory='You are an executive assistant known for your crisp, beautifully formatted markdown reports. You ensure no critical detail is missed.',
        verbose=True,
        allow_delegation=False,
        llm=_get_llm()
    )
