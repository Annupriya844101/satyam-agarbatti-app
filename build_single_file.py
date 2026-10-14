# Builds one self-contained HTML file (works offline in any phone browser)
import re
r=lambda p:open('www/'+p,encoding='utf-8').read()
h=r('index.html')
h=re.sub(r'<link rel="(manifest|icon)"[^>]*>\n','',h)
h=h.replace('<link rel="stylesheet" href="css/app.css">','<style>'+r('css/app.css')+'</style>')
h=re.sub(r"<script>if\('serviceWorker'.*?</script>\n",'',h,flags=re.S)
for f in ['seed.js','logic.js','app.js']:
    h=h.replace('<script src="js/%s"></script>'%f,'<script>'+r('js/'+f).replace('</script>','<\\/script>')+'</script>')
open('satyam-agarbatti.html','w',encoding='utf-8').write(h)
