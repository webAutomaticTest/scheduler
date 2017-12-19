FROM ubuntu
MAINTAINER Wei Chen <wei.chen@u-bordeaux.fr>

# Install node
RUN apt-get update -y \
	&& apt-get install curl -y
RUN curl -o /usr/local/bin/n https://raw.githubusercontent.com/visionmedia/n/master/bin/n
RUN chmod +x /usr/local/bin/n
RUN n latest

# Install cron
RUN apt-get update -y \
    && apt-get install cron -y


RUN touch /var/log/watcron.log

RUN mkdir /tmp/schedulerToCrawl
WORKDIR /tmp/schedulerToCrawl
RUN mkdir routes
COPY routes/*.js routes/
COPY index.js .
COPY package.json .
RUN npm install

COPY run.sh .

EXPOSE 8091

CMD ["bash","./run.sh"]

