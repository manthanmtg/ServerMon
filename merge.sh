git checkout -b auto/architecture-refactoring-20260504-1325
git add .
git commit -m "refactor(ui): extract form and panel components from CronsPage

Selected prompt: architecture-refactoring-agent"
git push -u origin auto/architecture-refactoring-20260504-1325
gh pr create --title "refactor(ui): extract form and panel components from CronsPage" --body "Automatically extracted components from CronsPage to improve architecture, following the architecture-refactoring-agent prompt."
gh pr merge --squash --admin
git checkout main
git pull
git branch -D auto/architecture-refactoring-20260504-1325
