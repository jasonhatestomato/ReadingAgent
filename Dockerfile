# 1. 使用你指定的 Python 3.10.6 版本
FROM python:3.10.6-slim

# 2. 设置工作目录
WORKDIR /app

# 3. 复制所有文件
# (包括 app.py, requirements.txt, template/, static/ 等)
COPY . .

# 4. 安装依赖
# (Gunicorn 是生产环境必须的 WSGI 服务器)
RUN pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir -r requirements.txt gunicorn



# 6. 暴露 Gunicorn 运行的端口 (我们用 5000)
EXPOSE 5000

# 7. 启动 Gunicorn
# (关键修改：添加 --workers 5)
# 告诉 Gunicorn 每个 worker 最多等待 120 秒
CMD ["gunicorn", "--workers", "5", "--timeout", "300", "--bind", "0.0.0.0:5000", "app:app"]
