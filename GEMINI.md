# Revision Tracker Pro AI Routine

You have a special command available for this repository: **"Review my uploads"**.

When the user asks you to "Review my uploads" or run the review routine, follow these steps exactly:

1. Execute the following shell command to find all mistakes that do not yet have an AI solution:
   ```bash
   python -c "import sqlite3, json; conn = sqlite3.connect('data/database.db'); conn.row_factory = sqlite3.Row; print(json.dumps([dict(r) for r in conn.execute('SELECT id, image_path, subject, topic, difficulty, mistake, actionable_fix FROM mistakes WHERE ai_solution IS NULL').fetchall()]))"
   ```

2. If the list is empty, inform the user that all uploads have been reviewed!

3. For each item in the list:
   - Use the `read_file` tool to view the image located at `image_path`.
   - Analyze the image to understand the math/science question. 
   - **Lazy Mode Auto-Fill:** If `subject`, `topic`, `difficulty`, `mistake`, or `actionable_fix` are empty strings `""` or very generic, use your analysis to infer and formulate highly accurate values for them.
   - Formulate a highly detailed **MarkScheme**, **Solution**, and **Explanation**.
   - Ensure the explanation is clear and educational. **Use Markdown for formatting and LaTeX for all math equations** (e.g. `$$ \int x^2 dx $$` or `$x=5$`).

4. Create a temporary python script (e.g., `save_solutions.py`) to save your findings back to the database. The script should look like this:
   ```python
   import sqlite3
   
   def save_solution(mistake_id, solution_text, subject=None, topic=None, difficulty=None, mistake=None, fix=None):
       conn = sqlite3.connect('data/database.db')
       
       # Update solution
       conn.execute('UPDATE mistakes SET ai_solution = ? WHERE id = ?', (solution_text, mistake_id))
       
       # Update inferred fields if they were provided
       if subject: conn.execute('UPDATE mistakes SET subject = ? WHERE id = ?', (subject, mistake_id))
       if topic: conn.execute('UPDATE mistakes SET topic = ? WHERE id = ?', (topic, mistake_id))
       if difficulty: conn.execute('UPDATE mistakes SET difficulty = ? WHERE id = ?', (difficulty, mistake_id))
       if mistake: conn.execute('UPDATE mistakes SET mistake = ? WHERE id = ?', (mistake, mistake_id))
       if fix: conn.execute('UPDATE mistakes SET actionable_fix = ? WHERE id = ?', (fix, mistake_id))
       
       conn.commit()
       conn.close()

   # Call save_solution for each item you reviewed
   save_solution(
       mistake_id=1, 
       solution_text="Here is the step by step solution with math $x=2$...",
       subject="Maths", # Only pass these if you had to infer them because they were blank
       topic="Integration",
       difficulty="Hard",
       mistake="Forgot +C",
       fix="Always remember the constant of integration."
   )
   ```
5. Run the python script using `run_shell_command`.
6. Delete the temporary python script.
7. Inform the user that the review is complete, and they can now click the "ℹ️ AI Solution / MarkScheme" button on those items in their Dashboard!