FROM public.ecr.aws/lambda/nodejs:20

# Install Puppeteer dependencies for Amazon Linux 2
RUN yum install -y \
    atk \
    cups-libs \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    pango \
    xorg-x11-fonts-100dpi \
    xorg-x11-fonts-75dpi \
    xorg-x11-utils \
    xorg-x11-fonts-cyrillic \
    xorg-x11-fonts-Type1 \
    xorg-x11-fonts-misc \
    ipa-gothic-fonts \
    wget \
    nss \
    alsa-lib \
    libX11 \
    gtk3 \
    && yum clean all

# Set working directory
WORKDIR /var/task

# Copy application files
COPY package*.json ./
RUN npm install
COPY . .

# Set Lambda entrypoint
CMD ["handler.run"]
