from crewai import Crew, Process
from .tasks import get_tasks

def run_admin_report_crew():
    tasks, analyst, strategist, admin = get_tasks()
    
    crew = Crew(
        agents=[analyst, strategist, admin],
        tasks=tasks,
        process=Process.sequential,
        verbose=True
    )
    
    result = crew.kickoff()
    
    # In newer versions of crewai, kickoff returns a CrewOutput object.
    # Convert it to string.
    if hasattr(result, 'raw'):
        return result.raw
    return str(result)
