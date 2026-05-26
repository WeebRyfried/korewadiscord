p = '/home/ryfried/korewadiscord/wiki/LocalSettings.override.php'
with open(p) as f:
    lines = f.readlines()
result = []
for line in lines:
    result.append(line)
    if "'VisualEditor'," in line.strip() and line.strip() == "'VisualEditor',":
        result.append("\t'Echo',\n")
        result.append("\t'Thanks',\n")
        result.append("\t'DiscussionTools',\n")
        result.append("\t'Gadgets',\n")
        result.append("\t'InputBox',\n")
        result.append("\t'CiteThisPage',\n")
        result.append("\t'PageImages',\n")
        result.append("\t'TextExtracts',\n")
with open(p, 'w') as f:
    f.writelines(result)
print('done')
