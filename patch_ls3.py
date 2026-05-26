p = '/home/ryfried/korewadiscord/wiki/LocalSettings.override.php'
with open(p) as f:
    lines = f.readlines()
result = []
for line in lines:
    result.append(line)
    if line.strip() == "'Echo',":
        result.append("\t'Linter',\n")
with open(p, 'w') as f:
    f.writelines(result)
print('done')
