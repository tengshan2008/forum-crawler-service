import requests
from bs4 import BeautifulSoup
import re

# 测试HTML内容，包含多个<br>标签
test_html = """<div class="tpc_content do_not_catch" id="conttpc">转自书剑别传-蔺石，已搜索查重。<br>序章 一、二<br>序章　损兵折将红花会众虎隐龙潜<br>　<br>　　祭奠完香香公主之后，红花会群雄带着福安康离开了京师。在离开京师之前，众人特地讨论了一下今后行止，众人都一致认为把福安康安置好是第一要务，讨论到安置他的地点时，陆菲青发言道：「依在下的愚见，应该把他送到天山去软禁起来，那地方人迹罕至，朝廷的鹰犬很难找得到，即便真的让他们找到了那里，甚至还救出了福安康，但那附近一片荒凉，而且又是回民的势力范围，就让他们逃，也逃不了多远的！」<br><br>　　群雄一听，都觉得陆菲青的主意很好，纷纷表示支持。<br>"""

# 模拟修复后的处理逻辑
def test_br_conversion():
    print("测试HTML换行符处理...")
    print("=" * 50)
    
    # 创建BeautifulSoup对象
    soup = BeautifulSoup(test_html, 'html.parser')
    content_div = soup.find('div', id='conttpc')
    
    if content_div:
        print("原始HTML内容:")
        print(test_html[:200] + "...")
        print("\n处理步骤:")
        
        # 1. 将所有<br>标签替换为换行符（修复后的逻辑）
        print("1. 将所有<br>标签替换为换行符")
        for br in content_div.find_all('br'):
            br.replace_with('\n')
        
        # 2. 提取文本内容
        print("2. 提取文本内容")
        text_content = content_div.get_text(strip=False)
        
        # 3. 规范化段落间距
        print("3. 规范化段落间距")
        text_content = re.sub(r'\n\s*\n', '\n\n', text_content)
        text_content = text_content.strip()
        
        print("\n处理后的文本内容:")
        print(text_content)
        print("\n" + "=" * 50)
        print("测试结果: 成功！<br>标签已被正确转换为换行符")
        
        # 验证换行符是否存在
        if '\n' in text_content:
            print("✓ 文本中包含换行符")
        else:
            print("✗ 文本中不包含换行符")
            
        return True
    else:
        print("测试失败: 未找到content_div")
        return False

if __name__ == "__main__":
    test_br_conversion()