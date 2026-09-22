from crewai import Task
from .agents import create_data_analyst, create_strategist, create_reporting_admin

def get_tasks():
    analyst = create_data_analyst()
    strategist = create_strategist()
    admin = create_reporting_admin()

    fetch_data_task = Task(
        description='Fetch the latest platform statistics and active campaign data using the Fetch Platform Stats tool. Summarize the raw data into clear points.',
        expected_output='A raw summary of current platform stats, including total raised, backer counts, and highlights of the most active campaigns.',
        agent=analyst
    )

    strategy_task = Task(
        description='Review the raw data summary provided by the Data Analyst. Identify which campaign categories are performing best and suggest 2-3 marketing or platform growth strategies.',
        expected_output='A strategic analysis detailing category performance and 2-3 specific growth recommendations.',
        agent=strategist,
        context=[fetch_data_task]
    )

    report_task = Task(
        description='Take the data summary and the strategic analysis, and compile them into a beautifully formatted Markdown report. Use headers, bullet points, and bold text for emphasis. The report MUST include a "Platform Overview" section and a "Strategic Recommendations" section.',
        expected_output='A professional Markdown-formatted string representing the final Admin Report.',
        agent=admin,
        context=[fetch_data_task, strategy_task]
    )

    return [fetch_data_task, strategy_task, report_task], analyst, strategist, admin
