"""
PDF 转 Markdown 模块
使用 MinerU API 进行 PDF 到 Markdown 的转换
"""
import requests
import time
import zipfile
import io
from pathlib import Path
from typing import Optional, Dict
import json
from config import BASE_DIR


class PDFConverter:
    """PDF 转 Markdown 转换器（使用 MinerU API）"""
    
    def __init__(self, api_token: Optional[str] = None):
        """
        初始化转换器
        
        Args:
            api_token: MinerU API Token，如果不提供则从配置读取
        """
        # 从配置文件读取
        config_path = BASE_DIR / 'api_config.json'
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                pdf_config = config.get('pdf_converter', {})
                self.api_token = api_token or pdf_config.get('api_token', '')
                self.base_url = pdf_config.get('base_url', 'https://mineru.net/api/v4/extract')
                self.enable_ocr = pdf_config.get('enable_ocr', True)
                self.enable_formula = pdf_config.get('enable_formula', False)
                self.max_wait_seconds = pdf_config.get('max_wait_seconds', 90)
        else:
            self.api_token = api_token or ''
            self.base_url = 'https://mineru.net/api/v4/extract'
            self.enable_ocr = True
            self.enable_formula = False
            self.max_wait_seconds = 90
        
        if not self.api_token:
            print("⚠️  MinerU API Token 未配置")
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_token}"
        }
    
    def convert_pdf_to_markdown(
        self,
        pdf_path: str = None,
        pdf_url: str = None,
        output_path: Optional[str] = None
    ) -> str:
        """
        将 PDF 转换为 Markdown
        
        Args:
            pdf_path: PDF 文件路径（本地文件）
            pdf_url: PDF 文件URL（阿里云OSS等公网URL）
            output_path: 输出的 Markdown 文件路径（可选）
        
        Returns:
            markdown_path: 生成的 Markdown 文件路径
        
        Raises:
            FileNotFoundError: PDF 文件不存在
            Exception: 转换失败
        """
        # 如果提供了URL，直接使用
        if pdf_url:
            print(f"📤 使用提供的 PDF URL: {pdf_url}")
            final_pdf_url = pdf_url
            
            # 如果没有指定输出路径，从URL提取文件名
            if output_path is None:
                filename = pdf_url.split('/')[-1].replace('.pdf', '.md')
                output_path = Path(filename)
            else:
                output_path = Path(output_path)
        
        # 否则使用本地文件路径
        elif pdf_path:
            pdf_path = Path(pdf_path)
            
            if not pdf_path.exists():
                raise FileNotFoundError(f"PDF 文件不存在: {pdf_path}")
            
            # 如果没有指定输出路径，使用相同文件名
            if output_path is None:
                output_path = pdf_path.with_suffix('.md')
            else:
                output_path = Path(output_path)
            
            # 上传 PDF 到临时 URL
            print(f"📤 上传 PDF 文件: {pdf_path}")
            final_pdf_url = self._upload_pdf_to_temp_url(str(pdf_path))
            
            if not final_pdf_url:
                raise Exception("PDF 文件上传失败")
            
            print(f"✅ PDF 上传成功: {final_pdf_url}")
        
        else:
            raise ValueError("必须提供 pdf_path 或 pdf_url 参数之一")
        
        try:
            # 创建转换任务
            print(f"🔄 创建转换任务...")
            task_result = self._create_conversion_task(final_pdf_url)
            
            if not task_result.get("success"):
                raise Exception(f"创建转换任务失败: {task_result.get('error')}")
            
            # 获取任务 ID
            task_data = task_result["data"].get("data", {})
            task_id = task_data.get("task_id") or task_data.get("id")
            
            if not task_id:
                raise Exception("无法获取任务 ID")
            
            print(f"✅ 任务创建成功，ID: {task_id}")
            
            # 等待任务完成
            print(f"⏳ 等待转换完成（最长 {self.max_wait_seconds} 秒）...")
            completion_result = self._wait_for_completion(task_id)
            
            if not completion_result.get("success"):
                raise Exception(f"转换失败: {completion_result.get('message')}")
            
            # 提取 Markdown 内容
            print(f"📄 提取 Markdown 内容...")
            markdown_content = self._get_markdown_content(completion_result)
            
            if not markdown_content:
                raise Exception("无法获取 Markdown 内容")
            
            # 保存 Markdown 文件
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(markdown_content)
            
            print(f"✅ PDF 转换成功 → {output_path}")
            return str(output_path)
        
        except Exception as e:
            print(f"❌ PDF 转换失败: {e}")
            raise
    
    def _upload_pdf_to_temp_url(self, file_path: str) -> Optional[str]:
        """
        将 PDF 上传到临时公网 URL
        使用免费文件分享服务
        
        Args:
            file_path: 本地文件路径
        
        Returns:
            公网 URL，失败返回 None
        """
        # 尝试使用 catbox.moe
        try:
            print(f"尝试使用 catbox.moe 上传文件...")
            with open(file_path, 'rb') as f:
                files = {'fileToUpload': f}
                data = {'reqtype': 'fileupload'}
                response = requests.post(
                    'https://catbox.moe/user/api.php',
                    files=files,
                    data=data,
                    timeout=60
                )
                response.raise_for_status()
                
                url = response.text.strip()
                if url.startswith('https://files.catbox.moe/'):
                    return url
        except Exception as e:
            print(f"catbox.moe 上传失败: {e}")
        
        # 尝试使用 transfer.sh
        try:
            import os
            filename = os.path.basename(file_path)
            print(f"尝试使用 transfer.sh 上传文件...")
            with open(file_path, 'rb') as f:
                response = requests.put(
                    f'https://transfer.sh/{filename}',
                    data=f,
                    timeout=60
                )
                response.raise_for_status()
                
                url = response.text.strip()
                if url.startswith('https://transfer.sh/'):
                    return url
        except Exception as e:
            print(f"transfer.sh 上传失败: {e}")
        
        print("❌ 所有上传服务都失败")
        return None
    
    def _create_conversion_task(self, pdf_url: str) -> Dict:
        """创建 PDF 转换任务"""
        url = f"{self.base_url}/task"
        data = {
            "url": pdf_url,
            "is_ocr": self.enable_ocr,
            "enable_formula": self.enable_formula,
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=data, timeout=30)
            response.raise_for_status()
            return {
                "success": True,
                "data": response.json()
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _get_task_status(self, task_id: str) -> Dict:
        """获取任务状态"""
        url = f"{self.base_url}/task/{task_id}"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()
            return {
                "success": True,
                "data": response.json()
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _wait_for_completion(self, task_id: str) -> Dict:
        """等待任务完成"""
        start_time = time.time()
        
        while True:
            elapsed_time = time.time() - start_time
            if elapsed_time > self.max_wait_seconds:
                return {
                    "success": False,
                    "error": "timeout",
                    "message": f"任务处理超时（超过 {self.max_wait_seconds} 秒）"
                }
            
            status_result = self._get_task_status(task_id)
            if not status_result.get("success"):
                return status_result
            
            task_data = status_result.get("data", {}).get("data", {})
            
            if not isinstance(task_data, dict):
                time.sleep(5)
                continue
            
            current_state = task_data.get("state")
            
            if current_state in ["done", "success"]:
                return {"success": True, "data": task_data}
            elif current_state == "failed":
                error_message = task_data.get("err_msg", "未知错误")
                return {
                    "success": False,
                    "error": "failed",
                    "message": f"转换失败: {error_message}"
                }
            elif current_state == "pending":
                remaining = int(self.max_wait_seconds - elapsed_time)
                print(f"  任务进行中，{remaining}秒后超时...")
                time.sleep(5)
            else:
                time.sleep(5)
    
    def _get_markdown_content(self, task_result: Dict) -> Optional[str]:
        """从任务结果中提取 Markdown 内容"""
        try:
            if not task_result.get("success"):
                return None
            
            data = task_result.get("data", {})
            
            # 检查是否有 ZIP 文件 URL
            zip_url = data.get("full_zip_url")
            if zip_url:
                print(f"📦 下载 ZIP 文件: {zip_url}")
                return self._download_and_extract_markdown(zip_url)
            
            # 尝试直接获取 Markdown 内容
            possible_fields = ["markdown", "content", "result", "text", "output", "md_content"]
            
            for field in possible_fields:
                content = data.get(field)
                if content and isinstance(content, str) and len(content.strip()) > 0:
                    return content
            
            return None
        
        except Exception as e:
            print(f"提取 Markdown 内容失败: {e}")
            return None
    
    def _download_and_extract_markdown(self, zip_url: str) -> Optional[str]:
        """下载 ZIP 文件并提取 Markdown 内容"""
        try:
            response = requests.get(zip_url, timeout=60)
            response.raise_for_status()
            
            with zipfile.ZipFile(io.BytesIO(response.content)) as zip_file:
                file_list = zip_file.namelist()
                
                # 寻找 Markdown 文件
                markdown_files = [f for f in file_list if f.endswith(('.md', '.markdown'))]
                
                if markdown_files:
                    markdown_file = markdown_files[0]
                    with zip_file.open(markdown_file) as md_file:
                        raw_content = md_file.read()
                        
                        # 尝试多种编码
                        for encoding in ['utf-8', 'utf-8-sig', 'gbk', 'gb2312']:
                            try:
                                content = raw_content.decode(encoding)
                                return content
                            except UnicodeDecodeError:
                                continue
                        
                        # 使用替换模式
                        content = raw_content.decode('utf-8', errors='replace')
                        return content
                
                return None
        
        except Exception as e:
            print(f"下载和解析 ZIP 文件失败: {e}")
            return None


# 创建全局实例
try:
    pdf_converter = PDFConverter()
    if pdf_converter.api_token:
        print("✅ PDF 转换器初始化成功（MinerU API）")
    else:
        print("⚠️  PDF 转换器初始化成功，但 API Token 未配置")
        pdf_converter = None
except Exception as e:
    print(f"⚠️  PDF 转换器初始化失败: {e}")
    pdf_converter = None
